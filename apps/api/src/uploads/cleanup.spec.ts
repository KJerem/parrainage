import { UploadsCleanupService } from "./cleanup.js";

describe("UploadsCleanupService.purgeStale", () => {
  const at = new Date("2026-11-02T10:00:00Z");

  type Row = { id: string; status: string; storageKey: string | null; uploadId: string | null };

  function setup(
    rows: Row[],
    { attached = [] as string[], storageDown = false, absent = [] as string[] } = {},
  ) {
    const calls: string[] = [];
    const prisma = {
      media: {
        findMany: vi.fn(async () => rows),
        updateMany: vi.fn(async (args: { where: { id: string } }) => ({
          count: attached.includes(args.where.id) ? 0 : 1,
        })),
        delete: vi.fn(async (args: { where: { id: string } }) => {
          calls.push(`ligne ${args.where.id}`);
        }),
      },
    };
    const fail = (key: string) => {
      if (storageDown) {
        throw new Error("stockage indisponible");
      }
      if (absent.includes(key)) {
        throw Object.assign(new Error("absent"), { name: "NoSuchKey" });
      }
    };
    const storage = {
      abortMultipartUpload: vi.fn(async (key: string) => {
        calls.push(`abort ${key}`);
        fail(key);
      }),
      deleteObject: vi.fn(async (key: string) => {
        calls.push(`delete ${key}`);
        fail(key);
      }),
    };
    const service = new UploadsCleanupService(prisma as never, storage as never);
    return { service, prisma, storage, calls };
  }

  it("purge les envois abandonnés et les fichiers jamais joints de plus de 24 h", async () => {
    const { service, prisma, calls } = setup([
      { id: "m1", status: "PENDING_UPLOAD", storageKey: "uploads/m1.mp4", uploadId: "up-1" },
      { id: "m2", status: "READY", storageKey: "uploads/m2.jpg", uploadId: null },
    ]);
    expect(await service.purgeStale(at)).toBe(2);
    expect(calls).toEqual([
      "abort uploads/m1.mp4",
      "delete uploads/m1.mp4",
      "ligne m1",
      "delete uploads/m2.jpg",
      "ligne m2",
    ]);
    const [args] = prisma.media.findMany.mock.calls[0] as unknown as [
      { where: { createdAt: { lt: Date }; messageId: null; newsPostId: null } },
    ];
    expect(args.where.createdAt.lt).toEqual(new Date("2026-11-01T10:00:00Z"));
    expect(args.where).toMatchObject({ messageId: null, newsPostId: null });
  });

  it("laisse un fichier joint à un message entre la lecture et la purge", async () => {
    const { service, storage, prisma } = setup(
      [{ id: "m1", status: "READY", storageKey: "uploads/m1.jpg", uploadId: null }],
      { attached: ["m1"] },
    );
    expect(await service.purgeStale(at)).toBe(0);
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(prisma.media.delete).not.toHaveBeenCalled();
  });

  it("garde la ligne si le stockage est indisponible, pour réessayer", async () => {
    const { service, prisma } = setup(
      [{ id: "m1", status: "READY", storageKey: "uploads/m1.jpg", uploadId: null }],
      { storageDown: true },
    );
    expect(await service.purgeStale(at)).toBe(0);
    expect(prisma.media.delete).not.toHaveBeenCalled();
  });

  it("considère un objet déjà absent comme supprimé", async () => {
    const { service, prisma } = setup(
      [{ id: "m1", status: "REJECTED", storageKey: "uploads/absent.jpg", uploadId: null }],
      { absent: ["uploads/absent.jpg"] },
    );
    expect(await service.purgeStale(at)).toBe(1);
    expect(prisma.media.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
  });

  it("ne fait rien sans fichier à purger", async () => {
    const { service, prisma } = setup([]);
    expect(await service.purgeStale(at)).toBe(0);
    expect(prisma.media.updateMany).not.toHaveBeenCalled();
  });
});

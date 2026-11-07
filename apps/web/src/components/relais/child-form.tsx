"use client";

import {
  ageAt,
  type ChildCode,
  type ChildCodeProposal,
  childCodeProposalSchema,
  childCodeResetSchema,
  classNamesByLevel,
  consentTexts,
  initials,
  mediaPath,
  type MediaRef,
  type RelaisChildDetail,
  saveChildResultSchema,
  type School,
  schoolLevelLabels,
  schoolLevels,
  type SchoolLevel,
  schoolSchema,
} from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState, useTransition } from "react";
import {
  ArrowLeftIcon,
  Avatar,
  Button,
  Checkbox,
  Chip,
  Dialog,
  FormField,
  Input,
  Notice,
  Select,
  toast,
} from "@/components/ui";
import { ApiRequestError, apiFetch, NETWORK_ERROR_MESSAGE } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { ChildCodeCard, ChildCodeImages } from "./child-code";
import { childFileStatusLabels, childSummaryLabel } from "./relais-labels";
import { useMediaUpload } from "./use-media-upload";

type FieldErrors = Readonly<Record<string, readonly string[]>>;

const fieldsetClass = "m-0 flex flex-col gap-4 rounded-16 border border-line bg-white p-[22px]";
const legendClass = "px-2 text-17 font-bold";
const NEW_SCHOOL = "__nouvelle-ecole__";

const errorMessage = (caught: unknown) =>
  caught instanceof ApiRequestError ? caught.message : NETWORK_ERROR_MESSAGE;

const ALL_CLASSES = schoolLevels.flatMap((level) => classNamesByLevel[level]);

/** Fiche d'un enfant (RW-AjoutEnfant) : création, reprise d'un brouillon ou modification. */
export function ChildForm({
  child,
  schools: initialSchools,
  proposal: initialProposal,
  schoolYear,
  now,
}: {
  /** Absent à la création. */
  child?: RelaisChildDetail;
  schools: readonly School[];
  /** Code proposé par le serveur, si l'enfant n'en a pas encore. */
  proposal: ChildCodeProposal | null;
  schoolYear: string;
  now: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const consentFileRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const [firstName, setFirstName] = useState(child?.firstName ?? "");
  const [lastInitial, setLastInitial] = useState(child?.lastInitial ?? "");
  const [gender, setGender] = useState<"" | "F" | "M">(child?.gender ?? "");
  const [birthDate, setBirthDate] = useState(child?.birthDate ?? "");
  const [district, setDistrict] = useState(child?.district ?? "");
  const [schools, setSchools] = useState<readonly School[]>(initialSchools);
  const [schoolId, setSchoolId] = useState(child?.schoolId ?? "");
  const [className, setClassName] = useState(child?.className ?? "");
  const [year, setYear] = useState(child?.schoolYear ?? schoolYear);
  const [teacherName, setTeacherName] = useState(child?.teacherName ?? "");
  const [guardianName, setGuardianName] = useState(child?.guardianName ?? "");
  const [guardianPhone, setGuardianPhone] = useState(child?.guardianPhone ?? "");
  const [consentSponsorship, setConsentSponsorship] = useState(child?.consentSponsorship ?? false);
  const [consentMedia, setConsentMedia] = useState(child?.consentMedia ?? false);
  const [photo, setPhoto] = useState<MediaRef | null>(child?.photo ?? null);
  const [consentDocument, setConsentDocument] = useState<MediaRef | null>(
    child?.consentDocument ?? null,
  );
  const [proposal, setProposal] = useState(initialProposal);
  const [proposalBusy, setProposalBusy] = useState(false);

  const [sending, setSending] = useState<"draft" | "submit" | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; code: ChildCode } | null>(null);
  const [addingSchool, setAddingSchool] = useState(false);

  const photoUpload = useMediaUpload("child");
  const consentUpload = useMediaUpload("child");

  const isDraft = !child || child.fileStatus === "DRAFT";
  const school = schools.find((s) => s.id === schoolId) ?? null;
  const classes = school ? classNamesByLevel[school.level] : ALL_CLASSES;
  const classOptions =
    className && !classes.includes(className) ? [className, ...classes] : classes;
  const displayName = `${firstName.trim() || "Prénom"} ${lastInitial.trim().charAt(0).toUpperCase() || "N"}.`;
  const age = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? ageAt(birthDate, now) : null;

  async function proposeAnother() {
    setProposalBusy(true);
    try {
      const { data } = await apiFetch("/api/relais/child-code", childCodeProposalSchema);
      setProposal(data);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setProposalBusy(false);
    }
  }

  async function submit(action: "draft" | "submit") {
    setSending(action);
    setError(null);
    setFieldErrors({});
    try {
      const { data } = await apiFetch(
        child ? `/api/relais/children/${encodeURIComponent(child.id)}` : "/api/relais/children",
        saveChildResultSchema,
        {
          method: "POST",
          body: {
            action,
            codeToken: action === "submit" ? (proposal?.token ?? null) : null,
            firstName,
            lastInitial,
            gender: gender || undefined,
            birthDate,
            district,
            schoolId: schoolId || null,
            className,
            schoolYear: year,
            teacherName,
            guardianName,
            guardianPhone,
            consentSponsorship,
            consentMedia,
            photoMediaId: photo?.id ?? null,
            consentDocumentId: consentDocument?.id ?? null,
          },
        },
      );
      if (data.code) {
        // Le code ne sera plus jamais lisible : la carte s'affiche avant de quitter la page.
        setCreated({ name: `${data.child.firstName} ${data.child.lastInitial}.`, code: data.code });
        setSending(null);
        startTransition(() => router.refresh());
        return;
      }
      toast(isDraft && action === "draft" ? "Brouillon enregistré" : "Fiche enregistrée");
      startTransition(() => {
        router.push("/relais/enfants");
        router.refresh();
      });
    } catch (caught) {
      setError(errorMessage(caught));
      if (caught instanceof ApiRequestError) {
        setFieldErrors(caught.fieldErrors);
      }
      setSending(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit("submit");
  }

  if (created) {
    return (
      <div className="flex max-w-[640px] flex-col gap-4">
        <h1 className="m-0 text-30 font-extrabold max-sm:text-24">Dossier envoyé au bureau</h1>
        <p className="m-0 text-15 text-ink-soft">
          Le bureau vérifie le dossier, puis propose un parrain. Remettez cette carte à
          l&apos;enfant : c&apos;est la seule fois où son code s&apos;affiche.
        </p>
        <ChildCodeCard name={created.name} code={created.code} />
        <div className="flex flex-wrap gap-2.5">
          <Button size="xl" onClick={() => window.print()}>
            Imprimer la carte
          </Button>
          <Button size="xl" variant="secondary" href="/relais/enfants">
            Retour à mes enfants
          </Button>
        </div>
      </div>
    );
  }

  const busy = sending !== null;
  const errorsOf = (field: string) => fieldErrors[field]?.join(" ");
  return (
    <>
      <div>
        <Button
          href={child ? "/relais/enfants" : "/relais"}
          variant="ghost"
          leftIcon={<ArrowLeftIcon size={18} />}
          className="-ml-3.5"
        >
          Retour
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 id={titleId} className="m-0 text-30 font-extrabold max-sm:text-24">
            {child ? `${child.firstName} ${child.lastInitial}.` : "Ajouter un enfant"}
          </h1>
          {child ? <Chip size="md">{childFileStatusLabels[child.fileStatus]}</Chip> : null}
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <form
          aria-labelledby={titleId}
          noValidate
          onSubmit={onSubmit}
          className="flex min-w-0 flex-col gap-5"
        >
          <fieldset className={fieldsetClass}>
            <legend className={legendClass}>1 · L&apos;enfant</legend>
            <div className="flex flex-wrap items-start gap-[18px]">
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  disabled={photoUpload.uploading}
                  onClick={() => fileRef.current?.click()}
                  className={cn(
                    "flex size-30 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-16 border-2 border-dashed border-line-strong bg-canvas px-2 text-13 font-semibold text-ink-soft",
                  )}
                >
                  {photo && mediaPath(photo) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL présignée de courte durée.
                    <img src={mediaPath(photo)!} alt="" className="size-full object-cover" />
                  ) : photoUpload.uploading ? (
                    "Envoi en cours…"
                  ) : (
                    "Prendre ou importer une photo"
                  )}
                  {photo ? <span className="sr-only">Changer la photo</span> : null}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  data-testid="photo-enfant"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) {
                      void photoUpload.upload(file).then((media) => {
                        if (media) setPhoto(media);
                      });
                    }
                  }}
                />
                {photoUpload.error ? (
                  <p role="alert" className="m-0 max-w-30 text-13 font-semibold text-danger-600">
                    {photoUpload.error}
                  </p>
                ) : null}
              </div>
              <div className="grid min-w-0 flex-[1_1_320px] grid-cols-1 gap-3.5 sm:grid-cols-2">
                <FormField label="Prénom" error={errorsOf("firstName")}>
                  <Input
                    value={firstName}
                    autoComplete="off"
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </FormField>
                <FormField
                  label="Nom (initiale)"
                  hint="Seule la première lettre est conservée."
                  error={errorsOf("lastInitial")}
                >
                  <Input
                    value={lastInitial}
                    autoComplete="off"
                    maxLength={2}
                    onChange={(event) => setLastInitial(event.target.value)}
                  />
                </FormField>
                <FormField label="Fille ou garçon" error={errorsOf("gender")}>
                  <Select
                    value={gender}
                    onChange={(event) => setGender(event.target.value as "" | "F" | "M")}
                  >
                    <option value="">Choisir…</option>
                    <option value="F">Fille</option>
                    <option value="M">Garçon</option>
                  </Select>
                </FormField>
                <FormField label="Date de naissance" error={errorsOf("birthDate")}>
                  <Input
                    type="date"
                    value={birthDate}
                    onChange={(event) => setBirthDate(event.target.value)}
                  />
                </FormField>
                <FormField
                  label="Quartier / village"
                  error={errorsOf("district")}
                  className="sm:col-span-2"
                >
                  <Input value={district} onChange={(event) => setDistrict(event.target.value)} />
                </FormField>
              </div>
            </div>
          </fieldset>

          <fieldset className={cn(fieldsetClass, "grid grid-cols-1 gap-3.5 sm:grid-cols-2")}>
            <legend className={legendClass}>2 · Scolarité</legend>
            <FormField label="École" error={errorsOf("schoolId")}>
              <Select
                value={schoolId}
                onChange={(event) => {
                  if (event.target.value === NEW_SCHOOL) {
                    setAddingSchool(true);
                  } else {
                    setSchoolId(event.target.value);
                  }
                }}
              >
                <option value="">Choisir…</option>
                {schools.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.shortName}
                  </option>
                ))}
                <option value={NEW_SCHOOL}>+ Ajouter une école</option>
              </Select>
            </FormField>
            <FormField label="Classe" error={errorsOf("className")}>
              <Select value={className} onChange={(event) => setClassName(event.target.value)}>
                <option value="">Choisir…</option>
                {classOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Année scolaire" error={errorsOf("schoolYear")}>
              <Input value={year} onChange={(event) => setYear(event.target.value)} />
            </FormField>
            <FormField label="Enseignant(e)" error={errorsOf("teacherName")}>
              <Input
                value={teacherName}
                placeholder="Facultatif"
                onChange={(event) => setTeacherName(event.target.value)}
              />
            </FormField>
          </fieldset>

          <fieldset className={fieldsetClass}>
            <legend className={legendClass}>3 · Responsable légal et accords</legend>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <FormField label="Nom du responsable" error={errorsOf("guardianName")}>
                <Input
                  value={guardianName}
                  autoComplete="off"
                  onChange={(event) => setGuardianName(event.target.value)}
                />
              </FormField>
              <FormField label="Téléphone" error={errorsOf("guardianPhone")}>
                <Input
                  type="tel"
                  value={guardianPhone}
                  autoComplete="off"
                  placeholder="+228 90 00 00 00"
                  onChange={(event) => setGuardianPhone(event.target.value)}
                />
              </FormField>
            </div>
            <div className="flex flex-col gap-1">
              <Checkbox
                label={consentTexts.sponsorship}
                checked={consentSponsorship}
                onChange={(event) => setConsentSponsorship(event.target.checked)}
              />
              {errorsOf("consentSponsorship") ? (
                <p className="m-0 text-13 font-semibold text-danger-600">
                  {errorsOf("consentSponsorship")}
                </p>
              ) : null}
            </div>
            <Checkbox
              label={consentTexts.media}
              checked={consentMedia}
              onChange={(event) => setConsentMedia(event.target.checked)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                loading={consentUpload.uploading}
                onClick={() => consentFileRef.current?.click()}
              >
                {consentDocument
                  ? "Remplacer l'autorisation"
                  : "Joindre l'autorisation signée (photo)"}
              </Button>
              {consentDocument ? (
                <span className="text-13 font-semibold text-brand-700">Autorisation jointe</span>
              ) : (
                <span className="text-13 text-muted">Le bureau en aura besoin pour valider.</span>
              )}
              <input
                ref={consentFileRef}
                type="file"
                accept="image/*,application/pdf"
                hidden
                data-testid="autorisation-enfant"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    void consentUpload.upload(file).then((media) => {
                      if (media) setConsentDocument(media);
                    });
                  }
                }}
              />
            </div>
            {consentUpload.error ? (
              <p role="alert" className="m-0 text-13 font-semibold text-danger-600">
                {consentUpload.error}
              </p>
            ) : null}
          </fieldset>

          <fieldset className={cn(fieldsetClass, "gap-3")}>
            <legend className={legendClass}>4 · Compte de l&apos;enfant</legend>
            <p className="m-0 text-14 leading-[1.5] text-ink-soft">
              L&apos;enfant se connecte en choisissant sa photo puis son code image. Il ne peut
              écrire que pendant une session ouverte par vous.
            </p>
            {isDraft && proposal ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-14 font-semibold">Code image proposé :</span>
                <ChildCodeImages code={proposal.images} />
                <Button
                  variant="ghost"
                  loading={proposalBusy}
                  onClick={() => void proposeAnother()}
                >
                  Générer un autre
                </Button>
              </div>
            ) : child ? (
              <CodeReset child={child} name={displayName} />
            ) : null}
          </fieldset>

          {error ? (
            <p role="alert" className="m-0 text-14 font-semibold text-danger-600">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2.5 max-sm:flex-col max-sm:*:w-full">
            {isDraft ? (
              <>
                <Button
                  size="xl"
                  type="submit"
                  loading={sending === "submit"}
                  disabled={busy && sending !== "submit"}
                >
                  Créer le compte et envoyer au bureau
                </Button>
                <Button
                  size="xl"
                  variant="secondary"
                  loading={sending === "draft"}
                  disabled={busy && sending !== "draft"}
                  onClick={() => void submit("draft")}
                >
                  Enregistrer le brouillon
                </Button>
              </>
            ) : (
              <Button size="xl" type="submit" loading={sending === "submit"}>
                Enregistrer les modifications
              </Button>
            )}
          </div>
        </form>

        <aside className="flex min-w-0 flex-col gap-4">
          <section
            aria-label="Aperçu"
            className="flex flex-col items-center gap-2.5 rounded-16 border border-line bg-white p-5 text-center"
          >
            <Avatar
              size={88}
              tone={child?.avatarTone ?? "info"}
              initials={initials(displayName)}
              src={photo ? (mediaPath(photo) ?? undefined) : undefined}
              alt=""
            />
            <strong className="text-18 [overflow-wrap:anywhere]">{displayName}</strong>
            <span className="text-14 text-ink-soft">
              {childSummaryLabel(age, className, school?.shortName ?? null)}
            </span>
            {child && child.parrains.length > 0 ? (
              <Chip variant="success">Parrainé par {child.parrains.join(", ")}</Chip>
            ) : (
              <Chip variant="info">En attente de parrain</Chip>
            )}
          </section>
          <Notice title="Et ensuite ?" className="rounded-16 p-[18px]">
            Le bureau vérifie le dossier, puis propose un parrain. Vous serez prévenu dès que le
            binôme est créé.
          </Notice>
        </aside>
      </div>

      {addingSchool ? (
        <AddSchoolDialog
          onClose={() => setAddingSchool(false)}
          onCreated={(created) => {
            setSchools((list) =>
              [...list, created].sort((a, b) => a.shortName.localeCompare(b.shortName, "fr")),
            );
            setSchoolId(created.id);
            setAddingSchool(false);
          }}
        />
      ) : null}
    </>
  );
}

/** Code d'un dossier envoyé : jamais réaffiché, seulement remplacé. */
function CodeReset({ child, name }: { child: RelaisChildDetail; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<ChildCode | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiFetch(
        `/api/relais/children/${encodeURIComponent(child.id)}/code`,
        childCodeResetSchema,
        { method: "POST" },
      );
      setFresh(data.images);
      setConfirming(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (fresh) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ChildCodeCard name={name} code={fresh} />
        <Button variant="secondary" onClick={() => window.print()}>
          Imprimer la carte
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-14 font-semibold">
        {child.hasCode
          ? "Un code est attribué : il ne s'affiche plus."
          : "Aucun code n'est encore attribué."}
      </span>
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        {child.hasCode ? "Générer un nouveau code" : "Générer un code"}
      </Button>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={child.hasCode ? "Remplacer le code de l'enfant ?" : "Générer le code de l'enfant ?"}
        description={
          child.hasCode
            ? "L'ancien code ne fonctionnera plus. Le nouveau s'affichera une seule fois, à imprimer."
            : "Il s'affichera une seule fois, à imprimer."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
            <Button loading={busy} onClick={() => void reset()}>
              Générer
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="m-0 text-14 font-semibold text-danger-600">
            {error}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}

function AddSchoolDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (school: School) => void;
}) {
  const [shortName, setShortName] = useState("");
  const [level, setLevel] = useState<SchoolLevel>("PRIMAIRE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiFetch("/api/relais/schools", schoolSchema, {
        method: "POST",
        body: { shortName, level },
      });
      onCreated(data);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Ajouter une école"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={busy} onClick={() => void create()}>
            Ajouter
          </Button>
        </>
      }
    >
      <FormField label="Nom de l'école" error={error}>
        <Input value={shortName} onChange={(event) => setShortName(event.target.value)} />
      </FormField>
      <FormField label="Niveau">
        <Select value={level} onChange={(event) => setLevel(event.target.value as SchoolLevel)}>
          {schoolLevels.map((option) => (
            <option key={option} value={option}>
              {schoolLevelLabels[option]}
            </option>
          ))}
        </Select>
      </FormField>
    </Dialog>
  );
}

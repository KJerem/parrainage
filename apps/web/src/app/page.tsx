export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-parrain flex-1 flex-col items-start justify-center gap-6 px-4 py-14 md:px-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-12 bg-accent-500 text-14 font-extrabold text-ink">
          LRT
        </span>
        <span className="text-20 font-bold">Parrainage</span>
      </div>
      <h1 className="m-0 max-w-[480px] text-28 leading-[1.1] font-extrabold sm:text-44">
        Suivez la scolarité de votre filleul, de près.
      </h1>
      <p className="m-0 max-w-[480px] text-18 leading-[1.5] text-ink-soft">
        La plateforme est en cours de construction : les espaces parrain, relais, enfant et bureau
        arrivent étape par étape.
      </p>
    </main>
  );
}

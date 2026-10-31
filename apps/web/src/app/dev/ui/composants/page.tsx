import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeftIcon,
  Avatar,
  BellIcon,
  Button,
  CameraIcon,
  Card,
  CardDescription,
  CardTitle,
  Checkbox,
  Chip,
  CountBadge,
  EmptyState,
  FileIcon,
  FilterPills,
  FormField,
  ImageIcon,
  Input,
  LockIcon,
  Logo,
  MessageIcon,
  MicIcon,
  Notice,
  PhotoSquare,
  ProgressBar,
  RadioCard,
  SegmentedControl,
  Select,
  SendIcon,
  ShieldIcon,
  StatTile,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
  UsersIcon,
  VideoIcon,
  WifiIcon,
  imageCodeIcons,
  imageCodes,
} from "@/components/ui";
import { InteractiveDemo } from "./interactive-demo";

export const metadata: Metadata = { title: "Composants" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="m-0 text-20 font-bold">{title}</h2>
      {children}
    </section>
  );
}

const buttonVariants = [
  "primary",
  "accent",
  "secondary",
  "ghost",
  "soft-accent",
  "soft-brand",
] as const;

const chipVariants = ["success", "warning", "danger", "info", "neutral", "solid-brand"] as const;

const avatarTones = [
  ["amber", "AS"],
  ["brand", "KA"],
  ["neutral", "MK"],
  ["dark", "LRT"],
  ["info", "YD"],
  ["info-strong", "CM"],
  ["amber-soft", "MT"],
  ["danger", "KA"],
  ["white", "EN"],
] as const;

const icons = [
  ["Message", MessageIcon],
  ["Vidéo", VideoIcon],
  ["Photo", CameraIcon],
  ["Image", ImageIcon],
  ["Micro", MicIcon],
  ["Fichier", FileIcon],
  ["Cloche", BellIcon],
  ["Réseau", WifiIcon],
  ["Cadenas", LockIcon],
  ["Bouclier", ShieldIcon],
  ["Enfants", UsersIcon],
  ["Envoyer", SendIcon],
] as const;

export default function ComposantsPage() {
  return (
    <main className="mx-auto flex w-full max-w-parrain flex-1 flex-col gap-10 px-4 py-10 md:px-6">
      <header className="flex flex-col gap-2">
        <Link href="/dev/ui" className="flex items-center gap-1.5 text-14 font-semibold">
          <ArrowLeftIcon size={16} /> Guide de style
        </Link>
        <h1 className="m-0 text-28 leading-[1.1] font-extrabold">Composants</h1>
      </header>

      <Section title="Boutons">
        <div className="flex flex-wrap items-center gap-3">
          {buttonVariants.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
          <Button loading>Envoi…</Button>
          <Button href="/dev/ui" variant="secondary" leftIcon={<ArrowLeftIcon size={18} />}>
            Lien bouton
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">sm</Button>
          <Button size="md">md</Button>
          <Button size="lg">lg</Button>
          <Button size="xl">xl</Button>
          <Button size="2xl">2xl</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-16 bg-brand-700 p-5">
          <Button variant="accent">Rejoindre (ouvre 10 min avant)</Button>
          <Button variant="outline-on-dark">Tester micro et caméra</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-16 bg-kid-canvas p-5">
          <Button variant="kid-primary">C&apos;est moi, j&apos;entre</Button>
          <Button variant="kid-accent">Prendre la photo</Button>
          <Button variant="kid-outline">J&apos;ai fini</Button>
        </div>
      </Section>

      <Section title="Pastilles et compteurs">
        <div className="flex flex-wrap items-center gap-2">
          {chipVariants.map((variant) => (
            <Chip key={variant} variant={variant}>
              {variant}
            </Chip>
          ))}
          <Chip variant="info" size="md">
            Parrainée depuis mars 2023
          </Chip>
          <CountBadge count={12} srLabel="messages à relire" />
        </div>
      </Section>

      <Section title="Cartes et indicateurs">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <StatTile label="Binômes actifs" value="42" sub="dans 3 pays · 3 relais" />
          <StatTile label="Messages à relire" value="12" tone="warning" sub="dont 3 avec photos" />
          <StatTile label="Sans nouvelle > 60 j" value="5" tone="danger" sub="relais prévenus" />
          <StatTile label="Réduction d'impôt estimée" value="356,40 €" variant="accent" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card as="section" className="flex flex-col gap-3">
            <CardTitle>Résultats scolaires</CardTitle>
            <ProgressBar
              label="CM1 · moyenne annuelle"
              valueLabel="11,8 / 20"
              value={11.8}
              max={20}
              tone="soft"
            />
            <ProgressBar label="CM2 · 1er trimestre" valueLabel="13,4 / 20" value={13.4} max={20} />
          </Card>
          <Card variant="brand" className="flex flex-col gap-2">
            <CardDescription>Prochain appel vidéo</CardDescription>
            <p className="m-0 text-22 font-extrabold">Samedi 14 novembre · 11 h</p>
          </Card>
          <Card variant="notice-accent">
            À quoi a servi votre don ce trimestre : frais de scolarité, kit de rentrée, cours du
            soir.
          </Card>
          <Card variant="inset">Mensualité · 25 €</Card>
        </div>
      </Section>

      <Section title="Avatars, photo et logo">
        <div className="flex flex-wrap items-center gap-3">
          {avatarTones.map(([tone, initials]) => (
            <Avatar key={tone} tone={tone} initials={initials} size={40} />
          ))}
          <Avatar tone="amber" initials="AS" size={96} label="Aïcha S." />
          <PhotoSquare label="Photo d'Aïcha" />
          <Logo />
          <Logo tone="accent" size={44} />
        </div>
      </Section>

      <Section title="Formulaires">
        <form className="grid max-w-[640px] gap-4 md:grid-cols-2" action="/dev/ui/composants">
          <FormField label="Adresse e-mail">
            <Input type="email" autoComplete="email" placeholder="claire.m@exemple.fr" />
          </FormField>
          <FormField label="Mot de passe" error="Adresse e-mail ou mot de passe incorrect.">
            <Input type="password" autoComplete="current-password" />
          </FormField>
          <FormField label="École">
            <Select defaultValue="EPP Bè">
              <option>EPP Bè</option>
              <option>EPP Akodessewa</option>
              <option>CEG Bè</option>
            </Select>
          </FormField>
          <FormField label="Enseignant(e)" hint="Facultatif">
            <Input />
          </FormField>
          <div className="md:col-span-2">
            <FormField label="Votre réponse">
              <Textarea rows={3} placeholder="Écrivez à Aïcha…" />
            </FormField>
          </div>
          <Checkbox
            className="md:col-span-2"
            label="Le responsable accepte le parrainage et l'échange de messages relus par l'association."
            defaultChecked
          />
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0 md:col-span-2">
            <legend className="mb-2 text-14 font-semibold">Choisir un parrain</legend>
            <RadioCard name="parrain" defaultChecked>
              <strong>Sophie L.</strong> · Nantes
            </RadioCard>
            <RadioCard name="parrain">
              <strong>Marc P.</strong> · Paris
            </RadioCard>
          </fieldset>
        </form>
        <div className="max-w-[640px] rounded-16 bg-kid-canvas p-5">
          <FormField label="Écris ton message" size="kid">
            <Textarea size="kid" rows={3} placeholder="Bonjour Claire…" />
          </FormField>
        </div>
      </Section>

      <Section title="Contrôles">
        <SegmentedControl
          aria-label="Durée"
          defaultValue="45"
          options={[
            { value: "30", label: "30 min" },
            { value: "45", label: "45 min" },
            { value: "60", label: "1 h" },
          ]}
        />
        <FilterPills
          aria-label="Filtrer la file de modération"
          defaultValue="tous"
          options={[
            { value: "tous", label: "Tous" },
            { value: "enfant", label: "Enfant → parrain" },
            { value: "parrain", label: "Parrain → enfant" },
            { value: "signales", label: "Signalés" },
          ]}
        />
        <Tabs defaultValue="parrains">
          <TabList aria-label="Conversations">
            <Tab value="parrains">Parrains</Tab>
            <Tab value="bureau">Bureau</Tab>
            <Tab value="enfants">Enfants</Tab>
          </TabList>
          <TabPanel value="parrains" className="pt-3 text-14">
            Conversations avec les parrains.
          </TabPanel>
          <TabPanel value="bureau" className="pt-3 text-14">
            Conversations avec le bureau.
          </TabPanel>
          <TabPanel value="enfants" className="pt-3 text-14">
            Messages envoyés par les enfants en session.
          </TabPanel>
        </Tabs>
        <div className="rounded-16 bg-kid-canvas p-5">
          <Tabs defaultValue="bulletin" variant="kid">
            <TabList aria-label="Que veux-tu envoyer ?">
              <Tab value="photo">Une photo</Tab>
              <Tab value="video">Une vidéo</Tab>
              <Tab value="bulletin">Mon bulletin</Tab>
            </TabList>
            <TabPanel value="photo" className="pt-3 text-16">
              Photo
            </TabPanel>
            <TabPanel value="video" className="pt-3 text-16">
              Vidéo
            </TabPanel>
            <TabPanel value="bulletin" className="pt-3 text-16">
              Pose ton bulletin dans le cadre jaune.
            </TabPanel>
          </Tabs>
        </div>
      </Section>

      <Section title="Messages et états">
        <Notice variant="accent">
          Hors ligne : la publication partira automatiquement dès le retour du réseau.
        </Notice>
        <Notice variant="brand" title="Sécurité de la session">
          Aucune adresse ni numéro ne peut être échangé : les messages sont relus.
        </Notice>
        <div className="rounded-16 bg-brand-700 p-4">
          <Notice variant="offline-dark" size="sm">
            Hors ligne · 2 publications seront envoyées au retour du réseau
          </Notice>
        </div>
        <EmptyState
          title="Aucune conversation"
          description="Les messages relus par l'association apparaîtront ici."
          action={<Button variant="secondary">Écrire un message</Button>}
        />
        <InteractiveDemo />
      </Section>

      <Section title="Icônes">
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3 p-0">
          {icons.map(([label, Icon]) => (
            <li
              key={label}
              className="flex flex-col items-center gap-2 rounded-12 border border-line bg-white p-3 text-12 text-ink-soft"
            >
              <Icon />
              {label}
            </li>
          ))}
          {imageCodes.map((code) => {
            const { label, Icon } = imageCodeIcons[code];
            return (
              <li
                key={code}
                className="flex flex-col items-center gap-2 rounded-12 border border-kid-line bg-white p-3 text-12 text-ink-soft"
              >
                <Icon size={34} />
                {label}
              </li>
            );
          })}
        </ul>
      </Section>
    </main>
  );
}

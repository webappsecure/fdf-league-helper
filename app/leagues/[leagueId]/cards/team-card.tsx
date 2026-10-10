import { Barlow_Condensed, Paytone_One } from "next/font/google";
import Image from "next/image";
import type { CSSProperties } from "react";
import {
  CITY_STEPS,
  TEAM_NAME_STEPS,
  cardColors,
  cardText,
  textStep,
  type CardTeam,
  type TextStep,
} from "@/lib/cards";
import logo from "@/public/fdf-logo.png";

// Free stand-ins for the sample card's FatFrank Heavy and Helvetica Neue
// Condensed Bold.
const display = Paytone_One({ weight: "400", subsets: ["latin"] });
const condensed = Barlow_Condensed({ weight: "600", subsets: ["latin"] });

const CITY_SIZES: Record<TextStep, string> = {
  0: "text-[2.5em] whitespace-nowrap",
  1: "text-[1.8em] whitespace-nowrap",
  2: "text-[1.25em] line-clamp-2",
};
const TEAM_NAME_SIZES: Record<TextStep, string> = {
  0: "text-[2em] whitespace-nowrap",
  1: "text-[1.45em] whitespace-nowrap",
  2: "text-[1.05em] line-clamp-2",
};

// A list is as tall as its bar at this many lines. A profile with all six
// offense qualities is one more, and prints smaller.
const FULL_SIZE_LINES = 6;

// A special result is reserved this much of the 14.4em box (two wrapped lines of
// the longest Table G text), and the list shrinks to fit the rest.
const RESULT_EM = 3.3;
const BOX_EM = 14.4;
const LINE_HEIGHT = 1.08;
const FULL_FONT_EM = 2.2;

function listFontEm(lines: number, hasResult: boolean): number {
  if (!hasResult) return lines > FULL_SIZE_LINES ? 1.88 : FULL_FONT_EM;
  return Math.min(FULL_FONT_EM, (BOX_EM - RESULT_EM) / (lines * LINE_HEIGHT));
}

function Side({
  name,
  label,
  lines,
  specialResult,
}: {
  name: string;
  label: string;
  lines: string[];
  specialResult: string | null;
}) {
  return (
    <section aria-label={name} className="flex gap-[0.5em]">
      <div
        aria-hidden="true"
        className={`${display.className} flex w-[3.1em] shrink-0 items-center justify-center border-[0.1em] border-(--card-primary-border) bg-(--card-primary-fill) text-(--card-primary-accent)`}
      >
        <span className="rotate-180 whitespace-nowrap text-[1.55em] leading-none [writing-mode:vertical-rl]">
          {label}
        </span>
      </div>
      <div className="min-w-0">
        <ul
          style={
            {
              "--list-size": `${listFontEm(lines.length, specialResult !== null)}em`,
            } as CSSProperties
          }
          className="text-(length:--list-size) leading-[1.08]"
        >
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {specialResult && <p className="mt-[0.3em] text-[1.2em] leading-tight">{specialResult}</p>}
      </div>
    </section>
  );
}

function Kick({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <div className="flex items-center gap-[0.45em]">
      <dt
        className={`${display.className} flex size-[3.1em] shrink-0 items-center justify-center border-[0.1em] border-(--card-secondary-border) bg-(--card-secondary-fill) text-(--card-secondary-accent)`}
      >
        <span aria-hidden="true" className="text-[1.45em] leading-none">
          {label}
        </span>
        <span className="sr-only">{name}</span>
      </dt>
      <dd className="text-[2.2em] leading-none">
        {value || <span className="sr-only">none</span>}
      </dd>
    </div>
  );
}

// One team's card in the layout of the Fast Drive Football sample. Every
// length is in em and the em follows the card's own width, so the card keeps
// its proportions at any size.
export function TeamCard({ team, seasonLabel }: { team: CardTeam; seasonLabel: string }) {
  const text = cardText(team, seasonLabel);
  const colors = cardColors(team.primaryColor, team.secondaryColor);
  // Team colors are data, so they reach the styles as custom properties.
  const style = {
    "--card-primary-fill": colors.primary.fill,
    "--card-primary-border": colors.primary.border,
    "--card-primary-text": colors.primary.text,
    "--card-primary-accent": colors.primary.accent,
    "--card-secondary-fill": colors.secondary.fill,
    "--card-secondary-border": colors.secondary.border,
    "--card-secondary-text": colors.secondary.text,
    "--card-secondary-accent": colors.secondary.accent,
  } as CSSProperties;

  return (
    <article
      aria-label={`${text.city} ${text.teamName} card`}
      style={style}
      // Browsers drop background fills on paper unless told to keep them.
      className="@container bg-card-paper text-card-ink [print-color-adjust:exact]"
    >
      <div className={`${condensed.className} p-[1.2em] text-[1.908cqw]`}>
        <header className={`${display.className} relative h-[5.46em]`}>
          <svg
            aria-hidden="true"
            viewBox="0 0 500 54.6"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
          >
            <polygon
              points="293.5,0.5 499.5,0.5 499.5,54.1 322.9,54.1"
              className="fill-(--card-secondary-fill) stroke-(--card-secondary-border)"
            />
            <polygon
              points="0.5,0.5 289,0.5 318.4,54.1 0.5,54.1"
              className="fill-(--card-primary-fill) stroke-(--card-primary-border)"
            />
          </svg>
          <div className="absolute inset-y-0 left-0 flex w-[57%] flex-col justify-between overflow-hidden py-[0.25em] pl-[0.55em] text-(--card-primary-text)">
            <p
              className={`${CITY_SIZES[textStep(text.city, CITY_STEPS)]} overflow-hidden leading-[1.05] text-(--card-primary-accent)`}
            >
              {text.city}
            </p>
            <p className="overflow-hidden text-[1.15em] leading-[1.1] whitespace-nowrap">
              {text.coachLine}
            </p>
          </div>
          <div className="absolute inset-y-0 right-0 flex w-[35%] flex-col justify-between overflow-hidden py-[0.35em] pr-[0.7em] text-right text-(--card-secondary-text)">
            <p
              className={`${TEAM_NAME_SIZES[textStep(text.teamName, TEAM_NAME_STEPS)]} overflow-hidden leading-[1.05] text-(--card-secondary-accent)`}
            >
              {text.teamName}
            </p>
            <p className="overflow-hidden text-[1.15em] leading-[1.1] whitespace-nowrap">
              {text.seasonLabel}
            </p>
          </div>
        </header>

        <div className="mt-[0.78em] grid h-[14.4em] grid-cols-[17.8em_17.9em_1fr]">
          <Side
            name={text.offenseTag ? `Offense [${text.offenseTag}]` : "Offense"}
            label={text.offenseTag ? `OFFENSE [${text.offenseTag}]` : "OFFENSE"}
            lines={text.offense}
            specialResult={text.offenseSpecialResult}
          />
          <Side
            name="Defense"
            label="DEFENSE"
            lines={text.defense}
            specialResult={text.defenseSpecialResult}
          />
          <dl className="flex flex-col justify-between">
            <Kick label="KR" name="Kick return" value={text.kickReturn} />
            <Kick label="PR" name="Punt return" value={text.puntReturn} />
            <Kick label="FG" name="Field goal" value={text.fgRange} />
            <Kick label="XP" name="Extra point" value={text.xpRange} />
          </dl>
        </div>

        {/* Loaded with the card, not lazily: a printed sheet needs every logo. */}
        <Image
          src={logo}
          alt="Fast Drive Football"
          loading="eager"
          unoptimized
          className="mt-[0.7em] h-auto w-[14.9em]"
        />
      </div>
    </article>
  );
}

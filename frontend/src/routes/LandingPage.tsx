import { Hero } from "../features/landing/Hero";
import { JustHappened } from "../features/landing/JustHappened";
import { NextUp } from "../features/landing/NextUp";
import { SceneSoFar } from "../features/landing/SceneSoFar";

/** "/": the hero, the next jams near the visitor, the latest results and the scene in numbers
 * (DESIGN.md §6 Landing). */
export function LandingPage() {
  return (
    <>
      <title>BreakingJam</title>
      <Hero />
      <NextUp />
      <JustHappened />
      <SceneSoFar />
    </>
  );
}

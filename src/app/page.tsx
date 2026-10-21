import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { APP_DESCRIPTION, APP_SHORT_NAME, APP_TAGLINE } from "@/constants";

export const metadata: Metadata = {
  title: `${APP_SHORT_NAME} — ${APP_TAGLINE}`,
  description: APP_DESCRIPTION,
};

export default function HomePage() {
  return <LandingPage />;
}

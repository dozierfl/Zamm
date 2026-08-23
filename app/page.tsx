import type { Metadata } from "next";
import StudioApp from "./studio-app";

export const metadata: Metadata = { title: "Create · Dozi Music Studio", description: "Shape an idea into a complete, versioned song." };
export default function Home() { return <StudioApp />; }

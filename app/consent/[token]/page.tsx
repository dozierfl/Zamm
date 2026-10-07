import type { Metadata } from "next";
import VocalistPermissionPage from "../vocalist-permission-page";

export const metadata: Metadata = {
  title: "Vocalist Permission",
  description: "Confirm private Dozi vocal permission.",
};

export default async function PermissionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <VocalistPermissionPage token={token} />;
}

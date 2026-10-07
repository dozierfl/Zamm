"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Permission = {
  vocalistName: string;
  projectTitle: string;
  ownerName: string;
  allowedUses: string[];
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  signedName: string | null;
  acceptedAt: string | null;
};

export default function VocalistPermissionPage({ token }: { token: string }) {
  const [permission, setPermission] = useState<Permission | null>(null);
  const [signedName, setSignedName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    fetch(`/api/vocalist-permissions/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { permission?: Permission; error?: { message?: string } };
        if (!response.ok || !body.permission) throw new Error(body.error?.message || "This permission link is unavailable.");
        if (current) setPermission(body.permission);
      })
      .catch((reason) => current && setError(reason instanceof Error ? reason.message : "This permission link is unavailable."));
    return () => {
      current = false;
    };
  }, [token]);
  const attestation = useMemo(
    () =>
      `I, ${signedName || "[your full name]"}, authorize ${permission?.ownerName || "the project owner"} to use my supplied vocal recordings for the private Dozi project “${permission?.projectTitle || "this project"}” as described above. I understand that I may withdraw future permission by contacting the project owner.`,
    [permission, signedName],
  );
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permission || permission.status !== "PENDING" || !signedName.trim() || !acknowledged || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/vocalist-permissions/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedName: signedName.trim(), acknowledged: true, attestationText: attestation }),
      });
      const body = (await response.json()) as { permission?: Permission; error?: { message?: string } };
      if (!response.ok || !body.permission) throw new Error(body.error?.message || "Your confirmation could not be saved.");
      setPermission(body.permission);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your confirmation could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  if (error && !permission)
    return <main className="permission-page"><section className="permission-card"><p className="permission-kicker">DOZI MUSIC STUDIO</p><h1>Permission link unavailable</h1><p>{error}</p></section></main>;
  if (!permission)
    return <main className="permission-page"><section className="permission-card"><p className="permission-kicker">DOZI MUSIC STUDIO</p><h1>Opening your permission request…</h1></section></main>;
  if (permission.status === "ACCEPTED")
    return <main className="permission-page"><section className="permission-card"><p className="permission-kicker">DOZI MUSIC STUDIO</p><h1>Thank you, {permission.signedName || permission.vocalistName}.</h1><p>Your private vocalist permission for <strong>{permission.projectTitle}</strong> has been recorded. You do not need a Dozi account.</p><p className="permission-note">Keep this page or ask {permission.ownerName} for a copy of the agreement if you would like one.</p></section></main>;
  if (permission.status !== "PENDING")
    return <main className="permission-page"><section className="permission-card"><p className="permission-kicker">DOZI MUSIC STUDIO</p><h1>This request is no longer active.</h1><p>Please contact {permission.ownerName} if you think you received this in error.</p></section></main>;
  return (
    <main className="permission-page">
      <section className="permission-card">
        <p className="permission-kicker">DOZI MUSIC STUDIO</p>
        <h1>Private vocalist permission</h1>
        <p className="permission-lede">{permission.ownerName} is asking {permission.vocalistName} to approve use of supplied vocal recordings for <strong>{permission.projectTitle}</strong>.</p>
        <div className="permission-summary">
          <strong>What this allows</strong>
          <ul>{permission.allowedUses.map((use) => <li key={use}>{use}</li>)}</ul>
          <small>Your recordings and resulting voice profile remain private to this Dozi project. This is not a public voice listing.</small>
        </div>
        <form onSubmit={accept}>
          <label>Your full name<input value={signedName} autoComplete="name" required maxLength={80} onChange={(event) => setSignedName(event.target.value)} placeholder="Type your full name" /></label>
          <div className="permission-statement">{attestation}</div>
          <label className="permission-check"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I have read this and agree to the private uses described above.</span></label>
          <button disabled={!signedName.trim() || !acknowledged || busy}>{busy ? "Saving your confirmation…" : "I agree"}</button>
        </form>
        {error && <p className="permission-error" role="alert">{error}</p>}
        <p className="permission-note">No account or password is required. This request expires {new Date(permission.expiresAt).toLocaleDateString()}.</p>
      </section>
    </main>
  );
}

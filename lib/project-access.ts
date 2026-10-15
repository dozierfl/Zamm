import { getSql } from "../db";

export const projectRoles = ["OWNER", "ADMIN", "EDITOR", "VOCALIST", "VIEWER"] as const;
export type ProjectRole = (typeof projectRoles)[number];

const roleRank: Record<ProjectRole, number> = {
  OWNER: 5,
  ADMIN: 4,
  EDITOR: 3,
  VOCALIST: 2,
  VIEWER: 1,
};

export async function requireProjectRole(
  databaseUrl: string | undefined,
  userId: string,
  projectId: string,
  minimumRole: ProjectRole = "VIEWER",
) {
  const sql = getSql(databaseUrl);
  const rows = await sql<{ role: ProjectRole }[]>`
    select role
    from project_members
    where project_id=${projectId} and user_id=${userId}
    limit 1
  `;
  const membership = rows[0];
  if (!membership || roleRank[membership.role] < roleRank[minimumRole]) {
    throw new Response(
      JSON.stringify({
        error: {
          code: "PROJECT_ACCESS_DENIED",
          message: "You do not have permission to access this project.",
          retryable: false,
        },
      }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  }
  return membership;
}

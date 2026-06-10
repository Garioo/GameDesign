/* ---------------------------------------------------------------------------
 * GitHub access for script blocks.
 *
 * Auth: when the user signs in with GitHub (scopes: "repo"), Supabase hands
 * back the GitHub access token as `session.provider_token` — but ONLY right
 * after the OAuth exchange; it is never re-delivered or refreshed. We stash
 * it in localStorage at the auth callback and use it from there. Without a
 * token, public repos still work (60 req/h unauthenticated limit).
 * ------------------------------------------------------------------------- */

const TOKEN_KEY = "emberwick.github-token";

export function getGithubToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Stash the provider token if this session carries one. Safe to call often. */
export function captureGithubToken(
  session: { provider_token?: string | null } | null | undefined,
): void {
  if (!session?.provider_token || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, session.provider_token);
  } catch {
    /* storage unavailable — degrade to unauthenticated */
  }
}

export class GithubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function gh<T>(path: string): Promise<T> {
  const token = getGithubToken();
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new GithubError(res.status, `GitHub ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

/** Full names ("owner/repo") of repos the signed-in user can access. */
export async function listRepos(): Promise<string[]> {
  if (!getGithubToken()) return [];
  const repos = await gh<{ full_name: string }[]>(
    "/user/repos?per_page=100&sort=pushed",
  );
  return repos.map((r) => r.full_name);
}

export interface RepoTree {
  branch: string; // default branch name
  paths: Set<string>; // fast existence checks (status dots)
  list: string[]; // ordered list for the picker
}

// One tree fetch per repo per session; `force` busts it (used by Refresh).
const treeCache = new Map<string, Promise<RepoTree>>();

export function getRepoTree(repo: string, force = false): Promise<RepoTree> {
  const cached = treeCache.get(repo);
  if (cached && !force) return cached;
  const p = (async (): Promise<RepoTree> => {
    const info = await gh<{ default_branch: string }>(`/repos/${repo}`);
    const tree = await gh<{ tree: { path: string; type: string }[] }>(
      `/repos/${repo}/git/trees/${encodeURIComponent(info.default_branch)}?recursive=1`,
    );
    const files = tree.tree.filter((t) => t.type === "blob").map((t) => t.path);
    return { branch: info.default_branch, paths: new Set(files), list: files };
  })();
  treeCache.set(repo, p);
  p.catch(() => {
    // don't cache failures (bad repo name, revoked token, rate limit)
    if (treeCache.get(repo) === p) treeCache.delete(repo);
  });
  return p;
}

/** Fetch a file's text content from the repo's default branch. */
export async function getFileContent(repo: string, filePath: string): Promise<string> {
  const encoded = filePath.split("/").map(encodeURIComponent).join("/");
  const data = await gh<{ content?: string; encoding?: string }>(
    `/repos/${repo}/contents/${encoded}`,
  );
  if (!data.content || data.encoding !== "base64") {
    throw new GithubError(415, `Unsupported content for ${filePath}`);
  }
  // base64 → UTF-8 (atob alone mangles multibyte characters)
  const binary = atob(data.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

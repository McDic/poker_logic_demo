const REPO_URL = "https://github.com/McDic/poker_logic_demo";

export function Footer() {
  const commit = __COMMIT__;
  const commitHref =
    commit === "dev" ? REPO_URL : `${REPO_URL}/commit/${commit}`;
  return (
    <footer className="footer">
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
        github.com/McDic/poker_logic_demo
      </a>
      <span className="footer__sep" aria-hidden="true">
        ·
      </span>
      <a
        className="footer__commit mono"
        href={commitHref}
        target="_blank"
        rel="noopener noreferrer"
        title={commit === "dev" ? "uncommitted dev build" : `commit ${commit}`}
      >
        {commit}
      </a>
    </footer>
  );
}

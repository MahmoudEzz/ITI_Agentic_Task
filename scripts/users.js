import { buildContainer, destroyContainer } from "../src/infra/config/container.js";

function usage() {
  console.error(
    [
      "Usage:",
      "  npm run users -- create --email <email> --password <password> --role recruiter|hiring_manager",
      "      Provisions a login account. There is no self-registration UI — this is the only way to create one.",
    ].join("\n"),
  );
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
  }
  return flags;
}

async function runCreate(flags, container) {
  const { email, password, role } = flags;
  if (!email || !password || !role) return usage(), process.exit(1);

  const createUserAccount = container.resolve("createUserAccount");
  const user = await createUserAccount({ email, password, role });
  console.log(`Created user ${user.email} (${user.role}), id ${user.id}.`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  const container = buildContainer();
  try {
    if (command === "create") await runCreate(flags, container);
    else {
      usage();
      process.exit(1);
    }
  } finally {
    await destroyContainer(container);
  }
}

main().catch((error) => {
  console.error("users run crashed:", error);
  process.exit(1);
});

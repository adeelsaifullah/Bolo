// Run with: npm run voice-test -- --stt deepgram --llm openai
// Reads keys only from the environment (.env.local is loaded if it exists). Never prints transcripts.
import { join } from "node:path";
import { ConfigError, requireConfig } from "@/lib/config";
import { readFxPkrPerUsd } from "@/lib/cost";
import { getLlmProvider } from "@/lib/llm";
import { ProviderError } from "@/lib/providers/errors";
import { getSttProvider } from "@/lib/stt";
import { InputError } from "./inputs";
import { runVoiceTest } from "./run";
import type { Thresholds } from "./summary";

const USAGE = `Usage: npm run voice-test -- [options]

  --stt <name>       speech-to-text provider: mock, deepgram, openai   (default: STT_PROVIDER, then mock)
  --llm <name>       feedback provider: mock, openai, gemini           (default: LLM_PROVIDER, then mock)
  --script <roman|urdu>   script for the Urdu explanations             (default: roman)
  --limit <n>        only the first n recordings, for a cheap first try
  --dry-run          check the files and show the audio length; sends nothing
  --fresh            ignore saved results and send everything again
  --dir <folder>     recordings folder                                 (default: voice-test/recordings)
`;

interface Args {
  stt?: string;
  llm?: string;
  script: "roman" | "urdu";
  limit: number | null;
  dryRun: boolean;
  fresh: boolean;
  dir: string;
  help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { script: "roman", limit: null, dryRun: false, fresh: false, dir: join("voice-test", "recordings"), help: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag = "", inline] = (argv[i] ?? "").split("=", 2);
    const value = (): string => {
      const v = inline ?? argv[++i];
      if (v === undefined || v.startsWith("--")) throw new InputError(`${flag} needs a value.\n\n${USAGE}`);
      return v;
    };
    switch (flag) {
      case "--stt": args.stt = value(); break;
      case "--llm": args.llm = value(); break;
      case "--dir": args.dir = value(); break;
      case "--script": {
        const v = value();
        if (v !== "roman" && v !== "urdu") throw new InputError(`--script must be roman or urdu, not "${v}".`);
        args.script = v;
        break;
      }
      case "--limit": {
        const n = Number(value());
        if (!Number.isInteger(n) || n < 1) throw new InputError("--limit must be a whole number of 1 or more.");
        args.limit = n;
        break;
      }
      case "--dry-run": args.dryRun = true; break;
      case "--fresh": args.fresh = true; break;
      case "--help": case "-h": args.help = true; break;
      default: throw new InputError(`Unknown option "${flag}".\n\n${USAGE}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // no .env.local: the shell's environment is used as it is
  }
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }

  // A dry run sends nothing, so it needs no keys: it uses the mock providers.
  const sttName = args.dryRun ? "mock" : (args.stt ?? process.env.STT_PROVIDER ?? "mock");
  const llmName = args.dryRun ? "mock" : (args.llm ?? process.env.LLM_PROVIDER ?? "mock");
  const stt = getSttProvider({ ...process.env, STT_PROVIDER: sttName });
  const llm = getLlmProvider({ ...process.env, LLM_PROVIDER: llmName });

  const thresholds: Thresholds = {
    minRecordings: requireConfig("app", "gates.g0.voice_test_min_recordings"),
    minSpeakers: requireConfig("app", "gates.g0.voice_test_min_speakers"),
    minCorrectionsRight: requireConfig("app", "gates.g0.min_corrections_judged_right"),
    maxWerOverall: requireConfig("app", "gates.g0.max_wer_overall"),
    maxWerGroup: requireConfig("app", "gates.g0.max_wer_per_speaker_group"),
    maxCostPkrPerMinute: requireConfig("app", "gates.g0.max_ai_cost_pkr_per_active_minute"),
    planningCostPkrPerMinute: requireConfig("app", "economics.ai_cost_pkr_per_active_minute_planning"),
  };

  const outcome = await runVoiceTest(
    {
      recordingsDir: args.dir,
      resultsRoot: join("voice-test", "results"),
      promptRoot: process.cwd(),
      script: args.script,
      limit: args.limit,
      dryRun: args.dryRun,
      fresh: args.fresh,
    },
    // A dry run shows no money, so it does not need the exchange rate.
    { stt, llm, fxPkrPerUsd: args.dryRun ? 1 : readFxPkrPerUsd(), thresholds, write: (line) => process.stdout.write(`${line}\n`) },
  );
  if (outcome.stoppedEarly) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const safe = error instanceof InputError || error instanceof ConfigError || error instanceof ProviderError;
  process.stderr.write(`${safe ? (error as Error).message : `Unexpected error (${error instanceof Error ? error.name : "unknown"}). Set VOICE_TEST_DEBUG=1 to see the details.`}\n`);
  if (process.env.VOICE_TEST_DEBUG === "1") process.stderr.write(`${String((error as Error | undefined)?.stack ?? error)}\n`);
  process.exitCode = 1;
});

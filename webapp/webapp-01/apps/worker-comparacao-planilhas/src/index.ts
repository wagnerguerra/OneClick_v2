import { spawn } from "node:child_process";
import path from "node:path";
import * as readline from "node:readline";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { COMPARACAO_PLANILHAS_QUEUE_NAME, type ComparacaoPlanilhasJobPayload } from "@webapp/contracts";
import { loadEnv } from "./env.js";

const env = loadEnv();

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  connectTimeout: 5_000,
});

const logger = {
  info: (...a: unknown[]) => console.log("[worker-comparacao]", ...a),
  error: (...a: unknown[]) => console.error("[worker-comparacao]", ...a),
};

function absolutizeJobPath(filePath: string): string {
  // A API pode rodar no Windows e enfileirar caminhos absolutos no estilo
  // "D:\...\temp_jobs\<id>\..." enquanto este worker roda em Linux (no container,
  // TEMP_JOBS_ROOT=/data/jobs). Unificamos os separadores e reancoramos qualquer
  // caminho que contenha ".../temp_jobs/<resto>" sob o TEMP_JOBS_ROOT local —
  // os arquivos são os mesmos via o bind mount ./temp_jobs:/data/jobs.
  const unified = filePath.replace(/\\/g, "/");
  const m = unified.match(/temp_jobs\/(.+)$/i);
  if (m) {
    return path.join(env.TEMP_JOBS_ROOT, m[1]);
  }
  const norm = path.normalize(unified);
  if (path.isAbsolute(norm)) return norm;
  return path.resolve(process.cwd(), norm.replace(/^\.\//, ""));
}

function runComparacaoCli(
  job: { updateProgress: (n: number) => Promise<void> },
  data: ComparacaoPlanilhasJobPayload
): Promise<void> {
  return new Promise((resolve, reject) => {
    const sefazPaths = data.sefazPaths.map(absolutizeJobPath);
    const sciPaths = data.sciPaths.map(absolutizeJobPath);
    const outputPath = absolutizeJobPath(data.outputPath);
    const cwd = env.COMPARACAO_PY_DIR;
    const cliPath = path.join(cwd, "cli.py");
    const cmd = env.PYTHON_CMD.trim();
    const base = path.basename(cmd).replace(/\.exe$/i, "").toLowerCase();
    const args: string[] =
      base === "py"
        ? ["-3", cliPath]
        : [cliPath];

    args.push("--sefaz", ...sefazPaths, "--sci", ...sciPaths, "--output", outputPath);

    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const stderrChunks: Buffer[] = [];
    child.stderr?.on("data", (c: Buffer) => stderrChunks.push(c));

    let jsonError: Error | null = null;

    const rl = readline.createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) return;
      try {
        const o = JSON.parse(trimmed) as {
          kind?: string;
          value?: number;
          message?: string;
        };
        if (o.kind === "progress" && typeof o.value === "number") {
          void job.updateProgress(o.value);
        }
        if (o.kind === "error" && typeof o.message === "string") {
          jsonError = new Error(o.message);
        }
      } catch {
        /* ignore */
      }
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      rl.close();
      if (jsonError) {
        reject(jsonError);
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      const errText = Buffer.concat(stderrChunks).toString("utf-8").trim().slice(0, 800);
      reject(
        new Error(
          errText
            ? `Python saiu com código ${code}: ${errText}`
            : `Python saiu com código ${code}`
        )
      );
    });
  });
}

new Worker<ComparacaoPlanilhasJobPayload>(
  COMPARACAO_PLANILHAS_QUEUE_NAME,
  async (job) => {
    const outputPath = absolutizeJobPath(job.data.outputPath);
    await job.updateProgress(1);
    await runComparacaoCli(job, job.data);
    await job.updateProgress(100);
    return { fileName: path.basename(outputPath) };
  },
  {
    connection,
    concurrency: 1,
  }
).on("failed", (j, err) => {
  logger.error("job failed", j?.id, err?.message);
});

logger.info(
  `Worker Comparação Planilhas ouvindo fila ${COMPARACAO_PLANILHAS_QUEUE_NAME} (Python: ${env.COMPARACAO_PY_DIR})`
);

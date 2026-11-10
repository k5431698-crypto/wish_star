// 소원 올리기 서버 함수 (Supabase Edge Function)
// 사이트가 { body, token }을 보내면: 서버에서 한 번 더 걸러내고 → 번호표를 해시해서 → wishes 표에 저장한다.
// 설정: 이 함수는 "Verify JWT"를 끈 채로 배포한다(공개 사이트에서 부르는 함수라서, 대신 아래에서 직접 검사).
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://k5431698-crypto.github.io";
const BAD_WORDS = ["시발", "씨발", "씨바", "병신", "개새끼", "좆", "지랄", "느금", "섹스", "야동"];

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// 사이트의 checkWish와 같은 기준 (이메일 / 긴 숫자 / 링크 / 거친 말)
function problemOf(text: string): string | null {
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)) return "email";
  if (/(?:\d[\s.\-]*){9,}/.test(text)) return "number";
  if (/(https?:\/\/|www\.)\S+|\b[\w-]+\.(com|net|kr|org|io|me)\b/i.test(text)) return "link";
  const compact = text.replace(/[\s.\-_*]/g, "");
  if (BAD_WORDS.some((w) => compact.includes(w))) return "badword";
  return null;
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "method" });

  let input: { body?: unknown; token?: unknown };
  try {
    input = await req.json();
  } catch {
    return reply(400, { error: "json" });
  }

  const body = typeof input.body === "string" ? input.body.trim() : "";
  const token = typeof input.token === "string" ? input.token : "";
  if (body.length < 1 || body.length > 200) return reply(400, { error: "length" });
  if (token.length < 32 || token.length > 100) return reply(400, { error: "token" });

  const problem = problemOf(body);
  if (problem) return reply(422, { error: "filtered", reason: problem });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await db
    .from("wishes")
    .insert({ body, token_hash: await sha256Hex(token) })
    .select("id")
    .single();
  if (error) return reply(500, { error: "save" });

  return reply(200, { id: data.id });
});

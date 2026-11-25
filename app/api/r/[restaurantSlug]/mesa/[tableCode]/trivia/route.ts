import { guestRoute, readBody } from "@/lib/operations/http";
import { findTable } from "@/lib/operations/sessions";
import { answerTrivia, readTrivia } from "@/lib/operations/trivia";
import { triviaAnswerSchema } from "@/lib/validators";

export const GET = guestRoute(async (_request, params) => readTrivia(await findTable(params)));

export const POST = guestRoute(async (request, params) => {
  const input = await readBody(request, triviaAnswerSchema);
  return answerTrivia(await findTable(params), input);
});

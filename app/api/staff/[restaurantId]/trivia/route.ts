import { readBody, staffRoute } from "@/lib/operations/http";
import { startTriviaRound, triviaQuestions } from "@/lib/operations/trivia";
import { startTriviaRoundSchema } from "@/lib/validators";

export const GET = staffRoute(["ADMIN"], (_request, restaurantId) => triviaQuestions(restaurantId));

export const POST = staffRoute(["ADMIN"], async (request, restaurantId) => {
  const input = await readBody(request, startTriviaRoundSchema);
  return startTriviaRound(restaurantId, input);
});

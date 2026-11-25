import "server-only";

import type { z } from "zod";

import { prisma } from "@/lib/prisma";
import type { startTriviaRoundSchema, triviaAnswerSchema } from "@/lib/validators";

import { requireThat } from "./http";
import { publish } from "./realtime";
import { withActiveTable, type TableKey } from "./sessions";

export async function readTrivia(table: TableKey) {
  const { restaurantId } = table;
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const question = { select: { prompt: true, options: true } };
    const round = await tx.triviaRound.findFirst({
      where: { restaurantId, startsAt: { lte: now }, endsAt: { gt: now } },
      select: {
        id: true, questionId: true, startsAt: true, endsAt: true, question,
        answers: {
          where: { session: { tableId: table.id, status: "ACTIVE" } },
          select: { optionIndex: true },
          take: 1,
        },
      },
    });
    const lastRound = await tx.triviaRound.findFirst({
      where: { restaurantId, endsAt: { lte: now }, ...(round ? { questionId: { not: round.questionId } } : {}) },
      orderBy: { endsAt: "desc" },
      select: { id: true, endsAt: true, question: { select: { ...question.select, correctIndex: true } } },
    });

    const sessions = await tx.tableSession.findMany({
      where: { restaurantId, status: "ACTIVE" },
      select: {
        table: { select: { number: true } },
        triviaAnswers: {
          where: { round: { endsAt: { lte: now } } },
          select: { points: true },
        },
      },
    });
    const leaderboard = sessions.map(({ table, triviaAnswers }) => ({
      tableNumber: table.number,
      points: triviaAnswers.reduce((total, answer) => total + answer.points, 0),
    })).sort((a, b) => b.points - a.points || a.tableNumber - b.tableNumber);

    const active = round
      ? { id: round.id, startsAt: round.startsAt, endsAt: round.endsAt, question: round.question,
          selectedOptionIndex: round.answers[0]?.optionIndex ?? null }
      : null;
    return { active, lastRound, leaderboard, serverTime: now };
  }, { isolationLevel: "RepeatableRead" });
}

export async function triviaQuestions(restaurantId: string) {
  return {
    questions: await prisma.triviaQuestion.findMany({
      where: { restaurantId, available: true }, orderBy: { prompt: "asc" },
      select: { id: true, prompt: true },
    }),
  };
}

export async function startTriviaRound(restaurantId: string, input: z.infer<typeof startTriviaRoundSchema>) {
  const round = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Restaurant" WHERE "id" = ${restaurantId} FOR UPDATE
    `;
    requireThat(locked.length, 404, "Restaurante no encontrado");
    const startsAt = new Date();
    const activeRound = await tx.triviaRound.findFirst({
      where: { restaurantId, endsAt: { gt: startsAt } }, select: { id: true },
    });
    requireThat(!activeRound, 409, "Ya hay una ronda vigente");

    const question = await tx.triviaQuestion.findUnique({
      where: { restaurantId_id: { restaurantId, id: input.questionId } },
      select: { available: true },
    });
    requireThat(question?.available, 404, "Pregunta no disponible");
    const endsAt = new Date(startsAt.getTime() + input.durationSeconds * 1000);
    return tx.triviaRound.create({
      data: { restaurantId, questionId: input.questionId, startsAt, endsAt },
      select: { id: true, startsAt: true, endsAt: true },
    });
  });
  publish(restaurantId, { topic: "trivia" });
  setTimeout(() => publish(restaurantId, { topic: "trivia" }), Math.max(0, round.endsAt.getTime() - Date.now())).unref();
  return { round };
}

export async function answerTrivia(table: TableKey, input: z.infer<typeof triviaAnswerSchema>) {
  const { restaurantId } = table;
  return withActiveTable(table, input.sessionId, async (tx) => {
    const now = new Date();
    const round = await tx.triviaRound.findUnique({
      where: { restaurantId_id: { restaurantId, id: input.roundId } },
      select: {
        startsAt: true, endsAt: true,
        question: { select: { options: true, correctIndex: true } },
      },
    });
    requireThat(round && round.startsAt <= now && round.endsAt > now, 409, "La ronda no está abierta");
    requireThat(input.optionIndex < round.question.options.length, 422, "Esa opción no existe");
    const key = { restaurantId, roundId: input.roundId, sessionId: input.sessionId };
    const answer = await tx.triviaAnswer.upsert({
      where: { restaurantId_roundId_sessionId: key },
      create: {
        ...key, optionIndex: input.optionIndex, points: Number(input.optionIndex === round.question.correctIndex),
      },
      update: {},
      select: { optionIndex: true },
    });
    return { selectedOptionIndex: answer.optionIndex };
  }).then((result) => {
    publish(restaurantId, { topic: "trivia", tableId: table.id });
    return result;
  });
}

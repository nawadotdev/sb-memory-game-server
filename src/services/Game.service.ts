import { Types } from "mongoose";
import { IGame, GameDB, CardStatus, GameStatus, GameActionType } from "../models/Game.model";

const toSafeGame = (game: IGame) => {
    return {
        _id: game._id.toString(),
        userId: game.userId.toString(),
        cards: game.deck.map((c) => ({
            index: c.index,
            status: c.status,
            value: c.status === CardStatus.HIDDEN ? undefined : c.value
        })),
        tries: Math.floor(game.actions.filter(a => a.action === GameActionType.FLIP).length / 2),
        score: game.score,
        createdAt: game.createdAt,
        status: game.status,
    };
};

export class GameSocketService {
    private static games = new Map<string, IGame & { timeout?: NodeJS.Timeout }>();

    static getAllGames() {
        return Array.from(this.games.values());
    }

    static async createGame(game: IGame, userId: string) {
        const created = await GameDB.create(game);
        const obj = created.toObject() as IGame;
        this.setGame(obj._id.toString(), obj, userId);
        return obj;
    }

    static getGame(id: string, userId: string): IGame | null {
        const g = this.games.get(id);
        return g && g.userId.toString() === userId ? g : null;
    }

    static async loadGame(id: string, userId: string) {
        const dbGame = await GameDB.findOne({ _id: id, userId }).lean<IGame>();
        if (!dbGame) return null;
        this.setGame(id, dbGame, userId);
        return dbGame;
    }

    static updateGame(id: string, game: IGame, userId: string) {
        this.setGame(id, game, userId);
    }

    static async persistGame(id: string) {
        const g = this.games.get(id);
        if (!g) return;
        const { timeout, ...rest } = g as any;
        await GameDB.findByIdAndUpdate(id, { $set: rest });
    }

    private static setGame(id: string, game: IGame, userId: string) {
        if (this.games.has(id)) clearTimeout(this.games.get(id)!.timeout);
        const timeout = setTimeout(async () => {
            await this.persistGame(id);
            this.games.delete(id);
        }, 10 * 60 * 1000);
        this.games.set(id, { ...game, userId: new Types.ObjectId(userId), timeout });
    }

    static flipCard(gameId: string, cardIndex: number, userId: string) {
        const game = this.getGame(gameId, userId);
        if (!game) throw new Error("Game not found");
        if (game.status !== GameStatus.IN_PROGRESS) throw new Error("Game is not in progress");

        const flipped = game.deck.filter(c => c.status === CardStatus.FLIPPED);
        if (flipped.length >= 2) {
            this.matchCards(gameId, userId);
        }

        const flippedAfterMatch = game.deck.filter(c => c.status === CardStatus.FLIPPED);
        if (flippedAfterMatch.length >= 2) {
            throw new Error("Already 2 cards flipped");
        }

        const card = game.deck[cardIndex];
        if (!card) throw new Error("Invalid card index");
        if (card.status !== CardStatus.HIDDEN) throw new Error("Card already flipped or matched");

        card.status = CardStatus.FLIPPED;
        game.actions.push({
            action: GameActionType.FLIP,
            timestamp: Date.now(),
            cardIndex,
        });

        this.updateGame(gameId, game, userId);
        return game;
    }

    static matchCards(gameId: string, userId: string) {
        const game = this.getGame(gameId, userId);
        if (!game) throw new Error("Game not found");
        if (game.status !== GameStatus.IN_PROGRESS) throw new Error("Game is not in progress");

        const flipped = game.deck.filter(c => c.status === CardStatus.FLIPPED);
        if (flipped.length !== 2) throw new Error("Need exactly 2 flipped cards");

        const [first, second] = flipped;
        if (first.value === second.value) {
            first.status = CardStatus.FOUND;
            second.status = CardStatus.FOUND;
            game.actions.push({
                action: GameActionType.MATCH,
                timestamp: Date.now(),
                matchedCardIndex: [first.index, second.index],
            });
            game.score += 1;
        } else {
            first.status = CardStatus.HIDDEN;
            second.status = CardStatus.HIDDEN;
        }

        if (game.deck.every(c => c.status === CardStatus.FOUND)) {
            game.status = GameStatus.COMPLETED;
        }

        this.updateGame(gameId, game, userId);
        return game;
    }

    static getSafeGame(gameId: string, userId: string) {
        const game = this.getGame(gameId, userId);
        if (!game) throw new Error("Game not found");
        return toSafeGame(game);
    }
}

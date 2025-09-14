import { IGame, GameDB, CardStatus, GameStatus, GameActionType } from "../models/Game.model";

const toSafeGame = (game: IGame) => {
    return {
        _id: game._id.toString(),
        userId: game.userId.toString(),
        cards: game.deck.map((c) => ({ index: c.index, status: c.status, value: c.status === CardStatus.HIDDEN ? undefined : c.value })),
        tries: game.actions.filter((a) => a.action === GameActionType.FLIP).length / 2,
        createdAt: game.createdAt,
        status: game.status,
    };
};

export class GameSocketService {
    private static games = new Map<string, IGame & { timeout?: NodeJS.Timeout }>();

    static getAllGames() {
        return Array.from(this.games.values());
    }

    static async createGame(game: IGame) {
        const created = await GameDB.create(game);
        const obj = created.toObject() as IGame;
        this.setGame(obj._id.toString(), obj);
        return obj;
    }

    static getGame(id: string): IGame | null {
        const g = this.games.get(id);
        return g ?? null;
    }

    static async loadGame(id: string) {
        const dbGame = await GameDB.findById(id).lean<IGame>();
        if (!dbGame) return null;
        this.setGame(id, dbGame);
        return dbGame;
    }

    static updateGame(id: string, game: IGame) {
        this.setGame(id, game);
    }

    static async persistGame(id: string) {
        const g = this.games.get(id);
        if (!g) return;
        await GameDB.findByIdAndUpdate(id, { $set: g });
    }

    private static setGame(id: string, game: IGame) {
        if (this.games.has(id)) clearTimeout(this.games.get(id)!.timeout);
        const timeout = setTimeout(async () => {
            await this.persistGame(id);
            this.games.delete(id);
        }, 10 * 60 * 1000);
        this.games.set(id, { ...game, timeout });
    }

    static flipCard(gameId: string, cardIndex: number) {
        const game = this.getGame(gameId);
        if (!game) throw new Error("Game not found");
        if (game.status !== GameStatus.IN_PROGRESS) throw new Error("Game is not in progress");

        const card = game.deck[cardIndex];
        if (!card) throw new Error("Invalid card index");
        if (card.status !== CardStatus.HIDDEN) throw new Error("Card already flipped or matched");

        const flipped = game.deck.filter(c => c.status === CardStatus.FLIPPED);
        if (flipped.length >= 2) throw new Error("Already 2 cards flipped");

        card.status = CardStatus.FLIPPED;
        game.actions.push({
            action: GameActionType.FLIP,
            timestamp: Date.now(),
            cardIndex,
        });

        this.updateGame(gameId, game);
        return game;
    }

    static matchCards(gameId: string) {
        const game = this.getGame(gameId);
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
        } else {
            first.status = CardStatus.HIDDEN;
            second.status = CardStatus.HIDDEN;
        }

        if (game.deck.every(c => c.status === CardStatus.FOUND)) {
            game.status = GameStatus.COMPLETED;
        }

        this.updateGame(gameId, game);
        return game;
    }

    static getSafeGame(gameId: string) {
        const game = this.getGame(gameId);
        if (!game) throw new Error("Game not found");
        return toSafeGame(game);
    }
}

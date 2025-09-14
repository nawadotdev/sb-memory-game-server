import { Schema, model, models, Types } from "mongoose";


export enum CardStatus {
    HIDDEN = "hidden",
    FLIPPED = "flipped",
    FOUND = "found",
}
export interface ICard {
    index: number;
    value: string;
    status: CardStatus;
}

export enum GameActionType {
    FLIP = "flip",
    MATCH = "match",
    START = "start",
    END = "end",
}

export interface IGameAction {
    action: GameActionType;
    timestamp: number;
    cardIndex?: number;
    matchedCardIndex?: number[];
}

export interface IGame {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    deck: ICard[];
    actions: IGameAction[];
    status: GameStatus;
    createdAt: Date;
    updatedAt: Date;
}

export enum GameStatus {
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
}

export const CardSchema = new Schema<ICard>({
    index: { type: Number, required: true },
    value: { type: String, required: true },
    status: { type: String, enum: CardStatus, required: true },
}, { _id: false });

export const GameActionSchema = new Schema<IGameAction>({
    action: { type: String, enum: GameActionType, required: true },
    timestamp: { type: Number, required: true },
    cardIndex: { type: Number, required: false },
    matchedCardIndex: { type: [Number], required: false },
}, { _id: false });

export const GameSchema = new Schema<IGame>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deck: { type: [CardSchema], required: true },
    actions: { type: [GameActionSchema], required: true },
    status: { type: String, enum: GameStatus, required: true },
}, {
    timestamps: true,
});

GameSchema.index({ userId: 1, createdAt: -1 });

export const GameDB = models?.Game || model<IGame>("Game", GameSchema);

export interface ISafeCard {
    index: number;
    value?: string;
    status: CardStatus;
}

export interface ISafeGame {
    _id: string;
    userId: string;
    cards: ISafeCard[];
    tries: number;
    createdAt: Date;
    updatedAt: Date;
}

export function toSafeGame(game: IGame): ISafeGame {
    const cards: ISafeCard[] = game.deck.map((c) => ({
      index: c.index,
      status: c.status,
      value: c.status === CardStatus.FOUND || c.status === CardStatus.FLIPPED ? c.value : undefined,
    }));
  
    return {
      _id: game._id.toString(),
      userId: game.userId.toString(),
      cards,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      tries: Math.floor(game.actions.filter((a) => a.action === GameActionType.FLIP).length / 2),
    };
  }
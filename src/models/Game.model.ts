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

export enum GameStatus {
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
}

export interface IGame {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    deck: ICard[];
    actions: IGameAction[];
    status: GameStatus;
    score: number;
    createdAt: Date;
    updatedAt: Date;
}

export const CardSchema = new Schema<ICard>({
    index: { type: Number, required: true },
    value: { type: String, required: true },
    status: { type: String, enum: CardStatus, required: true },
}, { _id: false });

export const GameActionSchema = new Schema<IGameAction>({
    action: { type: String, enum: GameActionType, required: true },
    timestamp: { type: Number, required: true },
    cardIndex: { type: Number },
    matchedCardIndex: { type: [Number] },
}, { _id: false });

export const GameSchema = new Schema<IGame>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deck: { type: [CardSchema], required: true },
    actions: { type: [GameActionSchema], required: true },
    status: { type: String, enum: GameStatus, required: true },
    score: { type: Number, required: true, default: 0 },
}, {
    timestamps: true,
});

GameSchema.index({ userId: 1, createdAt: -1 });
GameSchema.index({ score: -1 });

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
    score: number;
    createdAt: Date;
    updatedAt: Date;
}

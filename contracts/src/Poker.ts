import { Field, SmartContract, state, State, method, Poseidon, UInt64, Provable } from 'o1js';
import { evaluateHand } from './PokerLib.js';

export class ShuffleContract extends SmartContract {

    @state(Provable.Array(Field, 52)) shuffled = State<Field[]>()
    @state(Provable.Array(Field, 5)) boardCards = State<Field[]>()
    @state(Provable.Array(Provable.Array(Field, 2), 10)) playerHands = State<Field[][]>()
    @state(Field) winner = State<Field>();
  

    init() {
        super.init();
    }

    @method async shuffle() {
        const suits = ["Hearts", "Diamonds", "Clubs", "Spades"];
        const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
        const deck: Field[] = []

        let index = Field(0);
        for (let suitIndex = 0; suitIndex < suits.length; suitIndex++) {
            for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
                const card = Poseidon.hash([Field(suitIndex), Field(valueIndex)]);
                deck.push(index, card);
                index = index.add(1)
            }
        }

        let shuffled = deck.slice();

        // Fisher-Yates shuffle algorithm
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        this.shuffled.set(shuffled);
    }

    @method async allocateCards() {
        const shuffledDeck = this.shuffled.get();
        const tempPlayerHands: Field[][] = []       
        const tempBoardCards: Field[] = []

        // Deal two cards to each player
        for (let i = 0; i < 10; i++) {
            tempPlayerHands[i] = [shuffledDeck.pop()!, shuffledDeck.pop()!]
        }

        // Deal the board cards
        for (let i = 0; i < 5; i++) {
            tempBoardCards.push(shuffledDeck.pop()!);
        }

        this.playerHands.set(tempPlayerHands);
        this.boardCards.set(tempBoardCards);
    }

    @method async revealWinner() {
        const playerHands = this.playerHands.get();
        const boardCards = this.boardCards.get();
        const evaluatedHands: { [playerId: number]: Field } = {};

        for (const player in playerHands) {
            const hand = playerHands[player];
            const combinedHand = hand.concat(boardCards);
            evaluatedHands[player] = Field(evaluateHand(combinedHand));
        }

        let maxField = Field(0);
        for (const playerId in evaluatedHands) {
            maxField = Provable.if( evaluatedHands[playerId].greaterThan(maxField), evaluatedHands[playerId], maxField)
        }

        const winners: number[] = []
        for (let i = 0; i < 10; i++) {
            const handValue = evaluatedHands[i];
            if (handValue.equals(maxField).toBoolean()) {
                winners.push(i);
            }
        }
        this.winner.set(Field(winners.length));
    }

    @method async payout(amount: UInt64, playerId: number) {
        const winnersLength = this.winner.get().toBigInt()
        let isWinner = Field(0)

        for (let i = 0; i < winnersLength; i++) {
            const winnerId = Field(i)
            if (winnerId.equals(playerId).toBoolean()) {
                isWinner = Field(1)
                break;
            }
        }      

        if (isWinner) {
            this.send({ to: this.sender.getAndRequireSignature(), amount });
        } else {
            this.emitEvent('Payout', 'Player did not win');
        }
    }
}
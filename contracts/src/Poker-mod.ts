import { Field, SmartContract, state, State, method, Poseidon, UInt64, Provable, Bool, Circuit } from 'o1js';
import { evaluateHand } from './PokerLib.js';

export class ShuffleContract extends SmartContract {

  @state(Provable.Array(Field, 52)) shuffled = State<Field[]>()
  @state(Provable.Array(Field, 5)) boardCards = State<Field[]>()
  @state(Field) playerHands = State<{ [playerId: string]: Field[] }>()
  @state(Provable.Array(Field, 52)) winner = State<String[]>();
  

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

  @method async allocateCards(playerIds: Field[]) {
    const shuffledDeck = this.shuffled.get();
    const tempPlayerHands: { [playerId: string]: Field[] } = {};
    const tempBoardCards: Field[] = [];

    // Deal two cards to each player
    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i].toString()      
      tempPlayerHands[playerId] = [shuffledDeck.pop()!, shuffledDeck.pop()!]
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
    const evaluatedHands: { [playerId: string]: Field } = {};

    for (const playerId in playerHands) {
      const hand = playerHands[playerId];
      const combinedHand = hand.concat(boardCards);
      evaluatedHands[playerId] = Field(evaluateHand(combinedHand));
    }

    let maxField = Field(0);
    for (const playerId in evaluatedHands) {
      maxField = Provable.if( evaluatedHands[playerId].greaterThan(maxField), evaluatedHands[playerId], maxField)
    }

    const winners = {}
    let winnerCount = Field(0);
    for (const playerId in evaluatedHands) {
        winners{winnerCount, playerId} = Provable.if(evaluatedHands[playerId].equals(maxField), evaluatedHands[playerId], maxField) 
        {
        winners.set(winnerCount, playerId);
        winnerCount++;
      }
    }

    this.winner.set(winners.slice(0, winnerCount));
  }

  @method async payout(amount: UInt64, playerId: String) {
    const winners = this.winner.get();

    const isWinner = winners.includes(playerId);

    If(isWinner, () => {
      this.send({ to: this.sender.getAndRequireSignature(), amount });
    }).else(() => {
      this.emitEvent('Payout', 'Player did not win');
    });
  }
}

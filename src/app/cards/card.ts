export type CardType = 'attack' | 'defence' | 'curse';

export type PassiveType =
  | 'reduce' // reduserer skade/slurker mottaker får
  | 'skip' // hopper over neste tur
  | 'reflect' // sender angrepet tilbake
  | 'shield' // blokkerer et angrep
  | 'increase' // øker skade/slurker mottaker må drikke på sitt neste kort
  | 'double' // dobler effekten av neste kort
  | 'half' // halverer effekten av neste kort
  | 'random' // tilfeldig spiller får effekten
  | 'none'; // ingen passiv effekt

//TODO: Legg til en attack-passive der alle får slurk!

export interface Card {
  id: string;
  type: CardType;
  title: string;
  description: string;
  drinkAmount: number;
  passive: PassiveType[];
}

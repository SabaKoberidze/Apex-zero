export type Body =
  | 'sedan' | 'wagon' | 'hatch' | 'suv' | 'coupe' | 'pickup' | 'van' | 'convertible';

export type Drive = 'fwd' | 'rwd' | 'awd' | '4x4';
export type Trans = 'manual' | 'auto' | 'cvt' | 'dct' | 'single';

/** Where the car actually spends its life. This one drives a lot downstream. */
export type Use = 'city' | 'highway' | 'mountain' | 'trail' | 'track' | 'haul';

export type Clearance = 'low' | 'normal' | 'high';

/** Where the engine sits. Mid and rear are rare and change how a car drives. */
export type EnginePos = 'front' | 'mid' | 'rear';

export interface Car {
  id: string;
  make: string;
  model: string;
  yearFrom: number;
  yearTo: number;
  body: Body;
  drive: Drive;
  /** 0 means electric. */
  cylinders: number;
  /** Litres. 0 for electric. */
  displacement: number;
  hp: number;
  trans: Trans;
  gears: number;
  seats: number;
  /** Ground clearance, mm. */
  clearance: number;
  /** Subjective long-term reliability reputation, 1-5. */
  reliability: number;
  /** Combined MPG (US). Electrics use MPGe. */
  mpg: number;
  /** Typical used price in USD, rough. */
  price: number;
  /** How sporty/aggressive it looks, 1-5. Not how fast it is. */
  looks: number;
  enginePos: EnginePos;
  tags: string[];
}

export interface Prefs {
  use: Use;
  /** null means no preference. */
  body: Body | null;
  seats: number;
  drive: Drive | null;
  cylinders: 'any' | '3-4' | '5-6' | '8+' | 'electric';
  enginePos: EnginePos | null;
  trans: 'any' | 'manual' | 'auto' | 'cvt' | 'dct';
  power: number;      // 0-100, how much go you want
  sporty: number;     // 0-100, how loud it should look
  economy: number;    // 0-100, how much fuel economy matters
  minReliability: number;  // 1-5 floor
  budget: [number, number];
  /**
   * The one question this person actually cares about, by step key. It
   * roughly doubles that criterion's weight, and nothing else can hold it.
   */
  decisive: string | null;
}

export interface Scored {
  car: Car;
  score: number;
  reasons: { label: string; ok: boolean; detail: string }[];
}

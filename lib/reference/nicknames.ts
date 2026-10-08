// CE v1.5 Appendix C, Franchise Name Lookup Tables. Each table is rolled with a
// d100: index 0 is roll 01 and index 99 is roll 00.

const HISTORICAL_PRO_FOOTBALL = [
  "49ers", "All-Americans", "All-Stars", "Americans", "Apollos", "Arrows", "Badgers",
  "Battlehawks", "Bears", "Bengals", "Bills", "Bisons", "Blitz", "Blues", "Braves", "Breakers",
  "Broncos", "Browns", "Buccaneers", "Bulldogs", "Bulls", "Cardinals", "Chargers", "Chiefs",
  "Colonels", "Colts", "Commanders", "Cowboys", "Crimson Giants", "Defenders", "Demons",
  "Destroyers", "Dodgers", "Dolphins", "Dragons", "Eagles", "Enforcers", "Eskimos", "Express",
  "Falcons", "Federals", "Fire", "Fleet", "Football Team", "Gamblers", "Generals", "Giants",
  "Gold", "Guardians", "Gunners", "Gunslingers", "Hornets", "Hotshots", "Independents",
  "Invaders", "Iron", "Jaguars", "Jets", "Legends", "Legion", "Lions", "Marines", "Maroons",
  "Maulers", "Mustangs", "Nighthawks", "Oilers", "Outlaws", "Packers", "Panthers", "Patriots",
  "Pros", "Rage", "Raiders", "Rams", "Rangers", "Ravens", "Reds", "Red Wolves", "Renegades",
  "Roughnecks", "Saints", "Seahawks", "Showboats", "Spartans", "Stallions", "Stars", "Steelers",
  "Storm", "Texans", "Thunderbolts", "Tigers", "Titans", "Tornadoes", "Triangles", "Vikings",
  "Vipers", "Wildcats", "Wolverines", "Wranglers",
];

const MORE_TEAM_NICKNAMES = [
  "Aces", "Admirals", "Attack", "Avengers", "Aviators", "Badgers", "Bats", "Beavers",
  "Black Knights", "Blazers", "Bolts", "Brawlers", "Bruisers", "Buffaloes", "Bullets", "Chill",
  "Cobras", "Commandos", "Commodores", "Cougars", "Crows", "Crush", "Crushers", "Cyclones",
  "Drillers", "Elite", "Empire", "Explorers", "Explosion", "Fire", "Firebirds", "Flames",
  "Flashes", "Force", "Fury", "Gators", "Generals", "Gladiators", "Glory", "Golden Bears",
  "Grizzlies", "Hammers", "Heroes", "Honey Badgers", "Horned Frogs", "Hounds", "Huskies",
  "Inferno", "Lightning", "Lizards", "Machine", "Mammoths", "Maniacs", "Marauders", "Mavericks",
  "Mean Green", "Monarchs", "Mountaineers", "Ninjas", "Orcas", "Owls", "Pelicans", "Pirates",
  "Power", "Predators", "Pythons", "Racers", "Rage", "Rampage", "Raptors", "Rattlers",
  "Revolution", "Rhinos", "Royals", "Scorpions", "Screaming Eagles", "Sea Dogs", "Seals",
  "Shakedown", "Sharks", "Skyhawks", "Skykings", "Snakes", "Sparrows", "Spartans", "Stallions",
  "Stampeders", "Steeldogs", "Stingers", "Striders", "Sun Devils", "Surge", "Thunder", "Trojans",
  "Valkyrie", "Vandals", "Vultures", "Warhawks", "Wasps", "Yellow Jackets",
];

const EVEN_MORE_TEAM_NICKNAMES = [
  "Academics", "Banana Slugs", "Beasts", "Beewolves", "Berzerkers", "Blowfish", "Blurs",
  "Bobwhites", "Bombers", "Bowmen", "Brutes", "Burners", "Buzzards", "Buzzwings", "Caseys",
  "Cavalry", "Chaparrals", "Charging Wildcats", "Criminals", "Crocodons", "Cutters", "Dawgs",
  "Dusters", "Elephants", "Fantastics", "Feeders", "Fighting Koalas", "Finches", "Freebooters",
  "Freedom", "Frontrunners", "Goldbacks", "Grapplers", "Greys", "Grimcats", "Hares", "Haunters",
  "Hellions", "Herbisaurs", "Hooligans", "Hunters", "Ice Birds", "Iron Pigs", "Juggernauts",
  "Justice", "Kilties", "Knightmare", "Lancers", "Leather Wings", "Legends", "Lockhorns",
  "Loggers", "Logmen", "Machos", "Miners", "Moonstars", "Moose", "Nemesis", "Night Bats",
  "Nomads", "Norsemen", "Onslaught", "Overchargers", "Overdogs", "Pandas", "Papermakers",
  "Platypi", "Poets", "Pounders", "Protectors", "Prowl", "Pumas", "Quail", "Razors", "Razzles",
  "Revs", "Rowzers", "Royal Beasts", "Sand Gnats", "Sawteeth", "Scampers", "Scarlets",
  "Serpents", "Soultakers", "Spectres", "Spiders", "Spiderbears", "Spinners", "Spoilers",
  "Syrupmakers", "Tappers", "Toucans", "Tramplers", "Trappers", "Venom", "Wampus Cats",
  "Warbeasts", "Warriors", "Waxbills", "Wild Pigs",
];

export const NICKNAME_TABLES: string[][] = [
  HISTORICAL_PRO_FOOTBALL,
  MORE_TEAM_NICKNAMES,
  EVEN_MORE_TEAM_NICKNAMES,
];

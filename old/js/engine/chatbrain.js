// ============================================================
// BLOXVERSE engine — ChatBrain
// Procedural, mood-driven chat for AI players. No API, no
// network: template grammars + word pools + per-bot style
// processors. Anti-repetition via shuffled template decks and
// a global recent-line memory, so the same situation almost
// never produces the same sentence twice.
// ============================================================

export const MOODS = ['angry', 'happy', 'chill', 'competitive', 'silly', 'dramatic', 'shy'];

// ---------------- word pools ----------------
const POOLS = {
  // generic
  greet: ['yo', 'hey', 'hi', 'sup', 'hello', 'yoo', 'heyy', 'wsg', 'hai'],
  player: ['bro', 'dude', 'man', 'buddy', 'chief', 'gang', 'twin', 'lil bro'],
  gg: ['gg', 'ggs', 'good game', 'gg wp', 'ggz'],
  hypeAdj: ['insane', 'crazy', 'wild', 'nuts', 'unreal', 'cracked', 'goated', 'clean', 'nasty', 'smooth'],
  badAdj: ['trash', 'garbage', 'mid', 'washed', 'terrible', 'awful', 'hopeless', 'cooked', 'doodoo'],
  skillNoun: ['skill issue', 'diff', 'gap', 'talent gap', 'iq diff'],
  noob: ['noob', 'bot', 'npc', 'bum', 'casual', 'default', 'rookie', 'amateur'],
  excuse: ['i lagged', 'my ping spiked', 'my camera flipped', 'i misclicked', 'the sun was in my eyes', 'my cat walked on the keyboard', 'i was eating', 'my screen froze', 'i wasnt even trying', 'my joystick drifted'],
  threat: ['1v1 me', 'run it back', 'rematch now', 'square up', 'meet me at spawn', 'again. right now', 'do that again i dare you'],
  luck: ['lucky', 'so lucky', 'pure luck', 'rng', 'a fluke', 'beginner luck'],
  cel: ['lets goo', 'ez', 'too easy', 'no sweat', 'called it', 'and stay down', 'gg go next', 'sheesh'],
  cope: ['whatever', 'dont care', 'didnt want to win anyway', 'this game is rigged', 'im done', 'unbelievable'],
  laugh: ['lol', 'lmao', 'LMAO', 'haha', 'bruh', 'im crying', 'nah thats funny', 'HAHA'],
  agree: ['fr', 'so true', 'real', 'facts', 'deadass', 'no cap', 'exactly'],
  filler: ['ngl', 'icl', 'lowkey', 'tbh', 'fr fr', 'literally', 'actually'],
  food: ['pizza', 'tacos', 'a burger', 'nuggets', 'ramen', 'a sandwich', 'waffles'],
  // mood emoji
  'angry:emoji': ['😡', '💢', '🤬', '😤', '👿'],
  'happy:emoji': ['😄', '🎉', '😁', '✨', '🥳', '💛'],
  'chill:emoji': ['😎', '✌️', '🧊', '🤙'],
  'competitive:emoji': ['🏆', '💪', '🔥', '📈'],
  'silly:emoji': ['🤪', '🐸', '🧀', '🤡', '💀'],
  'dramatic:emoji': ['😱', '💔', '⚰️', '🌧️', '🎭'],
  'shy:emoji': ['🥺', '😅', '..', '🙈'],
};

// ---------------- template banks ----------------
// {slot} pulls from POOLS (mood-prefixed first), {killer} {victim} {name}
// {stage} {wave} {item} {weapon} {money} come from ctx.
const T = {
  spawn: {
    angry: ['who touched my spawn point', 'im not losing today. i refuse', 'everyone here is {badAdj} except me', 'lets get this over with', 'first person to touch me is getting dropped'],
    happy: ['{greet} everyone!!', 'omg hi guys', 'this is gonna be so fun', 'good luck everyone!!', 'yay im in!!', 'hii {player}s'],
    chill: ['{greet}', 'yo whats good', 'aight lets vibe', 'sup lobby', 'ez lobby ez life'],
    competitive: ['warming up. give me a sec', 'im going top 1 this game', 'watch the leaderboard', 'locked in.', 'no one talk to me im focusing'],
    silly: ['i have arrived. rejoice', 'hello fellow humans', 'my chair just squeaked wish me luck', 'i ate {food} before this so im basically unstoppable', 'whats up gamers and gamettes'],
    dramatic: ['and so... it begins', 'today is the day everything changes', 'i was born for this moment', 'destiny has brought us together again'],
    shy: ['hi...', 'um hello', 'hope i do ok', 'please be nice', 'h-hey everyone'],
  },
  idle: {
    angry: ['why is everyone so slow', 'this lobby is {badAdj}', 'someone fight me already', 'im getting impatient', 'the matchmaking put me with YOU people?'],
    happy: ['i love this game sm', 'this map is so pretty!!', 'anyone else having a great day?', 'you guys are fun to play with', 'we should all be friends'],
    chill: ['just vibing', 'this soundtrack in my head goes hard', 'anyone want {food} after this', 'no thoughts just blocks', 'chillin'],
    competitive: ['my apm is insane rn', 'check the scoreboard real quick', 'i been practicing this map all week', 'stats dont lie {player}'],
    silly: ['what if we all just jumped at the same time', 'i wonder if blocks dream', 'my head is literally a cube. wild', 'petition to add {food} to this game', 'do you think npcs know theyre npcs... asking for a friend'],
    dramatic: ['the calm before the storm...', 'i can feel it. something is coming', 'every second here is a story', 'the wind whispers of battle'],
    shy: ['this is nice i guess', 'um. hi again', 'is it ok if i follow you guys', 'just gonna stay over here'],
  },
  kill: {
    angry: ['{cel}. dont come back', 'stay down {victim}', 'thats what you get {victim}', '{victim} you really tried that on ME?', 'NEXT.', 'get {victim} outta here'],
    happy: ['omg i actually got {victim}!! sorry!!', 'yay!! gg {victim}!', 'that was so fun {victim} lets go again', 'nice try {victim}!! so close!'],
    chill: ['gg {victim}', 'unlucky {victim}', 'you good {victim}?', 'respect {victim}, good scrap'],
    competitive: ['{cel}', 'thats {skillNoun} {victim}', 'add it to the highlight reel', 'too slow {victim}, work on your timing', 'counted your cooldowns {victim}. study up'],
    silly: ['{victim} got bonked', 'boop. bye {victim}', '{victim}.exe has stopped working', 'i closed my eyes for that one {victim}', 'oops did i do that'],
    dramatic: ['farewell {victim}... you fought with honor', 'another soul falls to my blade', '{victim}, you flew too close to the sun', 'it didnt have to end this way {victim}'],
    shy: ['oh no im so sorry {victim}', 'sorry sorry sorry!!', 'i didnt mean to do it that hard', 'um. gg {victim}...'],
  },
  death: {
    angry: ['{killer} you are so {badAdj}', '{killer} is an unskilled {noob}', 'WHAT. {excuse}!!', '{killer} that was {luck} and you know it', '{threat} {killer}', 'im reporting you {killer}', 'this game is BROKEN. {killer} did NOT hit me', '{killer} you {noob}, {excuse}', 'nah nah nah {excuse}. rematch', 'touch me again {killer} and see what happens'],
    happy: ['omg nice one {killer}!!', 'aha you got me {killer}! good hit!', 'wow {killer} youre {hypeAdj}!', 'ok that was fair lol gg {killer}'],
    chill: ['gg {killer}', 'aight bet, nice hit {killer}', 'thats fine, respawns are free', 'lol you got me {killer}'],
    competitive: ['ok {killer}. noted.', 'wont happen again {killer}', 'lucky trade {killer}. watch the rematch', 'im studying your pattern {killer}, enjoy it while it lasts', 'that costs you later {killer}'],
    silly: ['i have been bonked', 'tell my {food} i loved it', 'welp. that happened', 'the floor and i are best friends now', 'skill issue (mine)'],
    dramatic: ['so this... is how it ends...', 'avenge me... AVENGE ME', 'i see the light... its blocky', 'betrayed by my own hubris', '{killer}... my rival... my downfall...'],
    shy: ['oh... ok', 'thats fair i guess...', 'sorry i wasnt better', 'ill just. respawn now', 'um ouch'],
  },
  lowhp: {
    angry: ['WHO IS HEALING ME. NOW', 'im NOT dying to these {noob}s', 'if i die i quit', 'one more hit and someone pays'],
    happy: ['uh oh im one hit!!', 'eek! low hp! wish me luck!!', 'this is fine!! its fine!!'],
    chill: ['im kinda low ngl', 'one hp club', 'living dangerously rn'],
    competitive: ['low hp. playing perfect from here', 'clutch time', 'this is where i shine'],
    silly: ['my hp bar is doing the limbo', 'im basically a ghost already', 'one sneeze and im gone'],
    dramatic: ['my vision fades...', 'i hear the respawn screen calling', 'not yet... i cannot fall yet'],
    shy: ['um. im really low. help?', 'please dont hit me im tiny', 'hiding now bye'],
  },
  win: {
    angry: ['finally. some respect', 'and NONE of you doubted me right?', 'that was harder than it needed to be', 'crown me and move on'],
    happy: ['WE DID IT!!', 'omg omg omg YES', 'best game ever!!', 'gg everyone that was amazing!!'],
    chill: ['gg lobby', 'ez clap, love yall tho', 'w vibes only'],
    competitive: ['#1. as calculated', 'the grind paid off', 'clean sweep. review the tape', 'that is how its done'],
    silly: ['i won?? I WON??', 'my {food} powered victory', 'gg i shall now do a lil dance', 'the prophecy was true'],
    dramatic: ['victory... at last...', 'the legends will speak of this day', 'this one is for everyone who believed'],
    shy: ['oh!! i won? thank you', 'that was scary but fun', 'gg everyone... good job...'],
  },
  lose: {
    angry: ['RIGGED. absolutely rigged', '{cope}', 'my team was {badAdj}, not me', 'enjoy it. it will NEVER happen again', 'i want a recount'],
    happy: ['aww gg!! that was still so fun', 'you all played great!!', 'gg gg!! round 2??'],
    chill: ['gg wp', 'we go next', 'all good, fun game'],
    competitive: ['unacceptable. running it back', 'i know exactly what i did wrong', 'noted. adjusting strategy', 'gg. rematch. now.'],
    silly: ['i blame the {food}', 'we lost but at what cost (everything)', 'defeat tastes like expired milk', 'gg i guess ill go touch grass'],
    dramatic: ['the tragedy is complete', 'let the rain fall upon my defeat', 'i will rise from these ashes', 'why do the heavens mock me'],
    shy: ['sorry guys...', 'i tried my best', 'gg... well played everyone'],
  },
  fall: {
    angry: ['WHO PUT THAT THERE', 'that platform is BROKEN', '{excuse}!!!', 'this obby was made by a {noob}', 'I HAD IT. I LITERALLY HAD IT', 'im about to uninstall gravity'],
    happy: ['wheee!! ok falling again lol', 'oops!! haha down i go', 'that was actually a fun fall ngl', 'im ok!! im ok!!'],
    chill: ['welp', 'gravity moment', 'and back to checkpoint we go', 'mb mb'],
    competitive: ['ok thats a timing error, fixing it', 'that jump is frame perfect i swear', 'recalculating route', 'wasted 12 seconds. unacceptable'],
    silly: ['AAAAAAAAA', 'the ground missed me so i came back', 'i meant to do that', 'geronimoooo', 'falling with style'],
    dramatic: ['NOOO not like this', 'the abyss claims me once more', 'tell stage {stage} i almost had her', 'i fall, therefore i am'],
    shy: ['eep', 'oh no... again...', 'im not very good at this', 'sorry you had to see that'],
  },
  checkpoint: {
    angry: ['finally. stage {stage}', 'stage {stage}. about time', 'if i fall from here im flipping the map'],
    happy: ['STAGE {stage}!! lets gooo', 'checkpoint!! im so proud of us', 'stage {stage} yay!!'],
    chill: ['stage {stage}, ez', 'checkpoint secured', 'stage {stage} in the bag'],
    competitive: ['stage {stage}. on pace for the record', 'split time looking good', 'stage {stage}, {player}s. keep up'],
    silly: ['stage {stage} baby!! kissing the checkpoint', 'the checkpoint and i are getting married', 'stage {stage}?? in THIS economy?'],
    dramatic: ['stage {stage}... one step closer to destiny', 'the summit calls to me', 'stage {stage}. the climb continues'],
    shy: ['stage {stage}... i did it', 'oh! checkpoint! nice', 'made it this far somehow'],
  },
  summit: {
    angry: ['I TOLD YOU. I TOLD ALL OF YOU', 'top of the tower. now bow', 'took long enough'],
    happy: ['I MADE IT TO THE TOP!!!', 'THE VIEW UP HERE OMG', 'we love the summit!!'],
    chill: ['summit. nice', 'view is fire up here', 'made it. who wants {food}'],
    competitive: ['summit. new personal best', 'first place. naturally', 'record run. clip it'],
    silly: ['im the king of the world!! *slips*', 'summit gang summit gang', 'i can see my house from here'],
    dramatic: ['the peak... i have conquered the unconquerable', 'heaven itself is within reach', 'this is MY mountain now'],
    shy: ['i... i actually made it', 'the top! wow', 'please dont push me off'],
  },
  wave: {
    angry: ['wave {wave} already? FINE. more targets', 'stop hiding and SHOOT them', 'these zombies are getting on my nerves'],
    happy: ['wave {wave}!! we got this team!!', 'heres wave {wave}, stay together!!', 'we make such a good team!!'],
    chill: ['wave {wave}. aight', 'they just keep coming huh', 'wave {wave}, stay chill and aim'],
    competitive: ['wave {wave}. watch my kill count', 'im carrying this squad btw', 'wave {wave}. formation up'],
    silly: ['wave {wave}?? the zombies unionized', 'here comes the green parade', 'why do they always groan. drink water'],
    dramatic: ['wave {wave}... the horde thickens', 'the night grows darker still', 'hold the line... HOLD THE LINE'],
    shy: ['wave {wave}... thats a lot of zombies', 'sticking close to you guys ok?', 'i dont like this part'],
  },
  zombieNear: {
    angry: ['GET OFF ME', 'personal space!!', 'i am NOT becoming zombie food'],
    happy: ['zombie hug!! no thanks!!', 'excuse me sir please back up!!'],
    chill: ['yo one of them is on me', 'lil help here', 'zombie got hands apparently'],
    competitive: ['reposition. now', 'kiting it. cover me'],
    silly: ['he just wants a hug (DO NOT LET HIM)', 'why is it SPRINTING', 'nope nope nope'],
    dramatic: ['its breath... i can smell it...', 'they hunger for me specifically'],
    shy: ['AAH its right there!!', 'help please please please'],
  },
  downed: {
    angry: ['are you SERIOUS. revive me NOW', 'if i bleed out im blaming all of you', 'this squad is {badAdj} i swear'],
    happy: ['im down!! no rush tho!!', 'oopsie!! little help?', 'down but not out!!'],
    chill: ['down. classic', 'yo pick me up when you get a sec', 'im chilling on the floor apparently'],
    competitive: ['down. my kd is safe tho', 'trade me out, i had 20 kills', 'revive me im the carry'],
    silly: ['the floor called, i answered', 'im just taking a lil nap', 'plot twist: i live here now'],
    dramatic: ['leave me... save yourselves...', 'so cold... so very cold...', 'my story ends here (unless revived)'],
    shy: ['um... im down... sorry', 'no rush... ill just wait here...'],
  },
  working: {
    angry: ['this job pays PENNIES', 'i am too skilled for this register', 'customer number 900 today. incredible'],
    happy: ['i love my job at bloxy burgers!!', 'another happy customer!!', 'work is fun when you smile!!'],
    chill: ['clocking in, dont wait up', 'shift number whatever, lets get it', 'making that bread. literally'],
    competitive: ['employee of the month incoming', 'nobody flips patties faster', 'promotion speedrun any%'],
    silly: ['would you like fries with that (i say to no one)', 'the fryer and i are beefing', 'i put extra pickles. i am the menu now'],
    dramatic: ['the register... my eternal rival', 'another day, another chapter of toil', 'i serve burgers. i serve destiny'],
    shy: ['first day at work... wish me luck', 'i hope the customers are nice', 'um. welcome to bloxy burgers...'],
  },
  paid: {
    angry: ['${money}? thats IT?', 'finally some money. barely', 'this economy is a joke'],
    happy: ['payday!! ${money}!!', 'omg ${money}! im rich(ish)!!', 'money money money!!'],
    chill: ['${money}. not bad', 'payday hits different', 'aight ${money} secured'],
    competitive: ['${money}. fastest earner in bloxville', 'stacking. as planned'],
    silly: ['${money}?? im buying 500 pickles', 'time to waste this responsibly', 'me and my ${money} against the world'],
    dramatic: ['${money}... the fruits of my suffering', 'wealth. power. burgers.'],
    shy: ['oh nice, ${money}', 'saving up for a lamp...'],
  },
  hungry: {
    angry: ['i need food NOW', 'if i dont eat someone gets hurt', 'hangry is not a joke'],
    happy: ['snack time!!', 'ooh i could go for {food}!!'],
    chill: ['kinda hungry ngl', 'thinking about {food} again'],
    competitive: ['fueling up. optimal macros', 'eating is part of the grind'],
    silly: ['my tummy is composing whale songs', 'i would fight a duck for {food}', 'stomach.exe requires input'],
    dramatic: ['the hunger... it consumes me', 'i waste away... dramatically'],
    shy: ['um. is it ok if i eat something', 'getting a lil hungry...'],
  },
  build: {
    angry: ['do NOT touch my furniture', 'who moved my couch. WHO', 'my house is better than yours. objectively'],
    happy: ['decorating is my favorite!!', 'this couch is PERFECT here', 'my house is coming together!!'],
    chill: ['new lamp who dis', 'feng shui check', 'crib update: its nice now'],
    competitive: ['my house valuation just went up', 'interior design leaderboard when?'],
    silly: ['i put a toilet in the living room. bold? yes', 'the plant is named gerald', 'walls are a social construct'],
    dramatic: ['behold... my palace rises', 'every brick tells my story'],
    shy: ['i got a small plant... its cute', 'i hope my house looks ok'],
  },
  visit: {
    angry: ['your house is fine i GUESS', 'i couldve built this better', 'why is your fridge empty'],
    happy: ['omg i love what youve done!!', 'your house is so cozy!!', 'can i live here lol'],
    chill: ['nice crib fr', 'yo this spot is clean', 'vibes in here are immaculate'],
    competitive: ['decent. mine has two more chairs', 'solid layout. 7/10'],
    silly: ['im stealing this couch (legally)', 'hello yes i live here now', 'your plant told me a secret'],
    dramatic: ['what a magnificent dwelling', 'this home... it has a soul'],
    shy: ['sorry for intruding... nice house', 'your place is really nice...'],
  },
  roundStart: {
    angry: ['dont feed. dont be {badAdj}. simple', 'this round is MINE', 'lock in or get carried'],
    happy: ['good luck everyone!!', 'new round new fun!!', 'lets go team!!'],
    chill: ['round time. lets cruise', 'ez round incoming', 'aight squad, usual plan'],
    competitive: ['executing strat. watch mid', 'round MVP speaking, follow me', 'comms up. lets work'],
    silly: ['round start! everyone do a spin first', 'strategy: yes', 'may the blockiest win'],
    dramatic: ['the battle horn sounds...', 'once more unto the arena'],
    shy: ['good luck... ill try to help', 'staying behind you guys ok'],
  },
  praise: {
    angry: ['ok that was decent. dont let it get to your head', 'fine. that was good. whatever'],
    happy: ['{player} that was {hypeAdj}!!', 'YOO nice one!!', 'you are so good at this!!'],
    chill: ['clean', 'that was smooth {player}', 'ok i see you'],
    competitive: ['good mechanics. respect', 'that was optimal actually'],
    silly: ['my jaw is on the floor and i cant find it', 'nerf {player} immediately'],
    dramatic: ['magnificent... simply magnificent', 'the stuff of legend'],
    shy: ['woah... that was really cool', 'how did you do that...'],
  },
};

// reply intents (keyword-matched against incoming chat)
const REPLIES = {
  greet: {
    angry: ['what do you want', 'yeah yeah hi', 'sup. dont get comfortable'],
    happy: ['HIII!!', 'heyy {from}!!', 'hi hi hi!!'],
    chill: ['yo {from}', 'sup', 'yoo whats good {from}'],
    competitive: ['hey. you ready to lose?', 'greetings, future runner-up'],
    silly: ['ahoy!!', 'greetings earthling', 'hi welcome to the circus'],
    dramatic: ['we meet again, {from}', 'ah... {from} arrives'],
    shy: ['h-hi {from}', 'oh! hello', 'hi...'],
  },
  gg: {
    angry: ['gg? that was {badAdj} and you know it', 'yeah gg i guess'],
    happy: ['GG!! so fun!!', 'ggs {from}!! you did great'],
    chill: ['gg {from}', 'ggs fr'],
    competitive: ['gg. review your gameplay tho', 'gg, decent effort'],
    silly: ['gg = great goose', 'ggs (giggling geese)'],
    dramatic: ['gg... until fate brings us together again'],
    shy: ['gg!! you were really good'],
  },
  insult: {
    angry: ['say that again. i DARE you', 'youre {badAdj} and {luck}', 'coming from YOU? {laugh}', '{threat}', 'ratio + {skillNoun}'],
    happy: ['aww thats not very nice :(', 'be nice!! we are all friends here'],
    chill: ['lol ok bro', 'sure thing champ', 'k'],
    competitive: ['scoreboard says otherwise', 'talk when you outrank me'],
    silly: ['i know you are but what am i', 'sir this is a bloxy burgers'],
    dramatic: ['your words wound deeper than any blade...', 'so cruel... so unnecessary...'],
    shy: ['oh... that hurt my feelings...', 'why would you say that...'],
  },
  lol: {
    angry: ['nothing is funny', 'stop laughing and play'],
    happy: ['{laugh}', 'IKR {laugh}', 'hahaha'],
    chill: ['{laugh}', 'lmaooo'],
    competitive: ['funny. now focus', '{laugh} ok back to winning'],
    silly: ['{laugh} {laugh}', 'why am i also laughing', 'tee hee'],
    dramatic: ['laughter... in times like these?', 'ha. ha. the comedy of it all'],
    shy: ['hehe', 'lol...'],
  },
  praise: {
    angry: ['i know.', 'obviously.', 'took you long enough to notice'],
    happy: ['omg thank you!!! youre {hypeAdj} too!!', 'stoppp youre so sweet!!'],
    chill: ['appreciate you {from}', 'ty ty'],
    competitive: ['thanks. hours of practice', 'noted. i am him'],
    silly: ['*bows in cube*', 'my mom says that too'],
    dramatic: ['your praise fuels my legend', 'i am... honored beyond words'],
    shy: ['oh!! thank you so much', 'that means a lot...'],
  },
  question: {
    angry: ['do i look like a search engine', 'figure it out', 'why are you asking ME'],
    happy: ['hmm good question!!', 'i think yes!! maybe!!', 'ooh idk but lets find out!!'],
    chill: ['prob', 'idk man but we vibing', 'good question tbh'],
    competitive: ['the answer is practice', 'irrelevant. focus up'],
    silly: ['the answer is always {food}', '42. next question', 'ask gerald the plant'],
    dramatic: ['some questions are not meant to be answered...', 'only fate knows'],
    shy: ['um... im not sure...', 'maybe? sorry im bad at questions'],
  },
  generic: {
    angry: ['cool story. anyway', 'and? your point?', 'k'],
    happy: ['totally!!', 'yes!! {agree}!!', 'i was just thinking that!!'],
    chill: ['{agree}', 'real', 'yeah fr'],
    competitive: ['{agree}. now lets win', 'sure. eyes on the objective'],
    silly: ['thats what SHE said (she = my grandma)', 'wild take but ok', '{agree} probably'],
    dramatic: ['profound words...', 'i shall meditate on this'],
    shy: ['yeah...', 'mhm', 'i agree i think'],
  },
};

// ---------------- brain ----------------
const recentGlobal = [];
function remember(line) {
  recentGlobal.push(line);
  if (recentGlobal.length > 60) recentGlobal.shift();
}

let uid = 0;

export class ChatBrain {
  constructor(persona = {}) {
    this.id = ++uid;
    this.mood = persona.mood || MOODS[Math.floor(Math.random() * MOODS.length)];
    this.chattiness = persona.chattiness ?? 0.5;
    this.style = {
      lower: persona.lower ?? Math.random() < 0.75,
      typo: persona.typo ?? Math.random() * 0.12,
      emoji: persona.emoji ?? Math.random() * 0.45,
      exclaim: persona.exclaim ?? Math.floor(Math.random() * 3),
      elongate: persona.elongate ?? Math.random() * 0.3,
    };
    this._decks = new Map();   // situation -> shuffled index deck
    this._rng = mulberry32(persona.seed ?? Math.floor(Math.random() * 1e9));
  }

  #pool(name) {
    return POOLS[`${this.mood}:${name}`] || POOLS[name] || null;
  }

  #pick(arr) { return arr[Math.floor(this._rng() * arr.length)]; }

  #deckDraw(situation, bank) {
    let deck = this._decks.get(situation);
    if (!deck || !deck.length) {
      deck = bank.map((_, i) => i);
      // fisher-yates
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(this._rng() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      this._decks.set(situation, deck);
    }
    return bank[deck.pop()];
  }

  #fill(tpl, ctx) {
    return tpl.replace(/\{(\w+)\}/g, (m, key) => {
      if (ctx && ctx[key] != null) return String(ctx[key]);
      const pool = this.#pool(key);
      if (pool) return this.#pick(pool);
      return m;
    });
  }

  #stylize(line) {
    const s = this.style;
    if (s.lower) line = line.toLowerCase();
    // elongate a trailing word vowel sometimes
    if (this._rng() < s.elongate) {
      line = line.replace(/([aeiou])(\b)(?=[^aeiou]*$)/i, (m, v, b) => v.repeat(2 + Math.floor(this._rng() * 3)) + b);
    }
    // angry bots sometimes go caps
    if (this.mood === 'angry' && this._rng() < 0.22) line = line.toUpperCase();
    // occasional adjacent-letter typo
    if (this._rng() < s.typo && line.length > 6) {
      const i = 2 + Math.floor(this._rng() * (line.length - 4));
      if (/[a-z]/.test(line[i]) && /[a-z]/.test(line[i + 1])) {
        line = line.slice(0, i) + line[i + 1] + line[i] + line.slice(i + 2);
      }
    }
    // extra punctuation
    if (/!$/.test(line) === false && this._rng() < 0.3 && s.exclaim > 0) {
      line += '!'.repeat(Math.ceil(this._rng() * s.exclaim));
    }
    // mood emoji
    if (this._rng() < s.emoji) {
      const em = this.#pool('emoji');
      if (em) line += ' ' + this.#pick(em);
    }
    return line;
  }

  line(situation, ctx = {}) {
    const bank = T[situation]?.[this.mood] || T[situation]?.chill;
    if (!bank) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = this.#deckDraw(situation, bank);
      const filled = this.#stylize(this.#fill(raw, ctx));
      if (!recentGlobal.includes(filled)) {
        remember(filled);
        return filled;
      }
    }
    return null;
  }

  maybe(situation, ctx = {}, prob = null) {
    const p = prob ?? this.chattiness;
    if (this._rng() > p) return null;
    return this.line(situation, ctx);
  }

  // respond to another chat message (keyword intent matching)
  reply(message, fromName, selfName = '') {
    const msg = message.toLowerCase();
    let intent = null;
    if (/\b(hi|hey|hello|yo|sup|wsg|hii+)\b/.test(msg)) intent = 'greet';
    else if (/\bgg|good game\b/.test(msg)) intent = 'gg';
    else if (/\b(noob|trash|bad|bot|garbage|mid|washed|suck|unskilled|ez|loser|bum)\b/.test(msg)) intent = 'insult';
    else if (/\b(lol|lmao|haha|xd|bruh|💀)\b/.test(msg)) intent = 'lol';
    else if (/\b(nice|good|great|insane|cracked|goated|amazing|pro|cool|sick|clean)\b/.test(msg)) intent = 'praise';
    else if (/\?$/.test(msg.trim()) || /\b(why|how|what|who|when|where)\b/.test(msg)) intent = 'question';
    else if (this._rng() < 0.5) intent = 'generic';
    if (!intent) return null;
    const bank = REPLIES[intent]?.[this.mood];
    if (!bank) return null;
    const raw = this.#pick(bank);
    const filled = this.#stylize(this.#fill(raw, { from: fromName, name: selfName }));
    remember(filled);
    return filled;
  }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

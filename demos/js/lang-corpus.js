// Little library of stories the language demos learn from.
// Handwritten stories + a "Word Garden" of simple sentences built from patterns,
// so words that mean similar things show up in similar places.
(function (root) {
  const STORIES = [
    {
      id: "pip",
      name: "Pip the Puppy",
      emoji: "🐶",
      text: `Once upon a time, there was a little puppy named Pip. Pip had a red ball. Pip loved his red ball very much. Every morning, Pip ran to the park with his red ball. At the park, Pip met a duck. "Hello, duck!" said Pip. "Do you want to play?" The duck said, "Quack! Yes, I want to play!" So Pip and the duck played with the red ball. They played and played all day. Then the ball rolled into the pond. Oh no! Pip was sad. The duck swam into the pond. The duck pushed the ball back to Pip. Pip was so happy. "Thank you, duck!" said Pip. "You are my best friend." The next day, Pip ran to the park again. The duck was waiting by the pond. "Hello, Pip!" said the duck. "Do you want to play?" Pip said, "Woof! Yes, I want to play!" So Pip and the duck played with the red ball again. A little frog jumped out of the pond. "Can I play too?" asked the frog. "Yes, you can play too!" said Pip. So Pip and the duck and the frog played all day. When the sun went down, Pip ran home with his red ball. Pip was tired but happy. Pip had two best friends now. The end.`,
    },
    {
      id: "moon",
      name: "The Sleepy Moon",
      emoji: "🌙",
      text: `Once upon a time, the moon was very sleepy. The moon said, "I want to sleep, but the night needs me." The stars said, "Do not worry, moon. We will shine for you." So the stars began to shine. They shone and shone. The owl looked up at the sky. "Where is the moon?" asked the owl. "The moon is sleeping," said a little star. The owl said, "Then I will sing a song for the moon." The owl sang a soft song. The fox heard the song. The fox sang too. The frog heard the song. The frog sang too. The bear heard the song. The bear sang too. Soon the whole forest was singing. The moon smiled in her sleep. The stars twinkled and twinkled. The owl sang and sang. When the sun came up, the moon woke up. "Thank you, friends," said the moon. "That was the best sleep ever." The owl said, "You are welcome, moon. We will sing for you again tonight." And every night after that, the forest sang a soft song for the sleepy moon. The end.`,
    },
    {
      id: "robo",
      name: "Robo Bakes a Cake",
      emoji: "🎂",
      text: `Once upon a time, there was a little robot named Robo. Robo wanted to bake a cake. Robo got a big bowl. Robo put in some flour. Robo put in some sugar. Robo put in two eggs. Then Robo mixed and mixed. "Beep boop! This is fun!" said Robo. Robo put the cake in the oven. Robo waited and waited. The kitchen smelled sweet. Ding! The cake was ready. Robo took the cake out of the oven. It was a big, round, yellow cake. Robo put pink frosting on the cake. Robo put red cherries on the cake. Then Robo shared the cake with all of the friends. The cat had some cake. The dog had some cake. The little mouse had some cake too. "Yummy!" said the cat. "Yummy!" said the dog. "Yummy, yummy!" said the little mouse. Robo was very happy. The next day, Robo wanted to bake a pie. Robo got a big bowl. Robo put in some apples. Robo put in some sugar. Then Robo mixed and mixed. "Beep boop! This is fun!" said Robo. Robo put the pie in the oven. The kitchen smelled sweet again. Ding! The pie was ready. Robo shared the pie with all of the friends. Baking is better with friends. The end.`,
    },
    {
      id: "rhymes",
      name: "Hoppy Rhymes",
      emoji: "🐸",
      text: `Hop, hop, little frog, hop up on the mossy log. Splash, splash, in the pond, swim to the lily pad beyond. Round and round the garden goes the little bunny with the pink nose. One hop, two hops, hop and see, the bunny is as quick as can be. Rain, rain, on the hill, the flowers drink and drink their fill. Sun, sun, in the sky, help the flowers grow up high. Up the mountain went the bear, with a blue hat and fuzzy hair. Down the mountain came the bear, with honey on his fuzzy hair. Buzz, buzz, little bee, come and have some tea with me. Buzz, buzz, little bee, fly back home to your honey tree. Tick, tock, goes the clock, the little mouse runs up the clock. Tick, tock, one o'clock, the little mouse runs down the clock. Splish, splash, the duck is wet, the wettest duck I ever met. Splish, splash, the duck says quack, the duck swims off and then swims back. Night, night, the moon is bright, the stars all twinkle in the night. Night, night, sleep tight, see you in the morning light.`,
    },
  ];

  // ---------- Word Garden: pattern sentences (deterministic) ----------
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const GROUPS = {
    animals: ["cat", "dog", "puppy", "kitten", "bunny", "duck", "frog", "bear", "fox", "mouse", "pig", "cow"],
    colors: ["red", "blue", "green", "yellow", "pink", "purple", "brown", "white"],
    food: ["apple", "banana", "cake", "cookie", "carrot", "cheese", "bread", "pie", "soup", "honey"],
    people: ["king", "queen", "prince", "princess", "man", "woman", "boy", "girl"],
    places: ["park", "forest", "garden", "beach", "river", "farm"],
  };

  function wordGarden() {
    const r = mulberry(42);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    const A = GROUPS.animals, C = GROUPS.colors, F = GROUPS.food, P = GROUPS.places;
    const things = ["ball", "hat", "kite", "boat", "car", "balloon"];
    const animalT = [
      (a) => `the ${a} ran to the ${pick(P)}.`,
      (a) => `the ${a} ate some ${pick(F)}.`,
      (a) => `the little ${a} likes ${pick(F)}.`,
      (a) => `the ${a} can run and jump.`,
      (a) => `the ${a} was sleepy, so the ${a} went to sleep.`,
      (a) => `the ${a} said hello to the ${pick(A)}.`,
      (a) => `look at the funny ${a}!`,
      (a) => `the baby ${a} played with its mom.`,
      (a) => `a ${a} lives on the farm.`,
      (a) => `the ${a} has four legs and a tail.`,
    ];
    const colorT = [
      (c) => `i see a ${c} ${pick(things)}.`,
      (c) => `my favorite color is ${c}.`,
      (c) => `she painted the door ${c}.`,
      (c) => `the sky turned ${c} and ${pick(C)}.`,
      (c) => `he has a ${c} hat and a ${pick(C)} kite.`,
      (c) => `we mixed the paint to make ${c}.`,
      (c) => `the flower is bright ${c}.`,
      (c) => `can you find something ${c}?`,
    ];
    const foodT = [
      (f) => `we ate ${f} for lunch.`,
      (f) => `the ${f} was so yummy.`,
      (f) => `can i have more ${f}, please?`,
      (f) => `mom made ${f} for dinner.`,
      (f) => `i like to eat ${f} with my friends.`,
      (f) => `the ${f} tasted sweet and good.`,
      (f) => `there is ${f} on the table.`,
      (f) => `dad cut the ${f} into pieces.`,
    ];
    const male = { king: 1, prince: 1, man: 1, boy: 1 };
    const royal = { king: 1, queen: 1, prince: 1, princess: 1 };
    const grown = { king: 1, queen: 1, man: 1, woman: 1 };
    const personT = [
      (p) => `the ${p} rode ${male[p] ? "his" : "her"} horse to the ${pick(P)}.`,
      (p) => `the ${p} waved ${male[p] ? "his" : "her"} hand.`,
      (p) => `${male[p] ? "he" : "she"} is a ${p}.`,
      (p) => `the ${p} smiled at ${male[p] ? "his" : "her"} friend.`,
      (p) => (royal[p] ? `the ${p} wore a golden crown.` : `the ${p} wore a warm coat.`),
      (p) => (royal[p] ? `the ${p} lives in a big castle.` : `the ${p} lives in a small house.`),
      (p) => (grown[p] ? `the ${p} went to work.` : `the ${p} went to school.`),
      (p) => (grown[p] ? `the ${p} is tall and grown up.` : `the ${p} is young and likes to play.`),
    ];
    const lines = [];
    for (let round = 0; round < 4; round++) {
      A.forEach((a) => lines.push(pick(animalT)(a), pick(animalT)(a)));
      C.forEach((c) => lines.push(pick(colorT)(c), pick(colorT)(c)));
      F.forEach((f) => lines.push(pick(foodT)(f), pick(foodT)(f)));
      GROUPS.people.forEach((p) => personT.forEach((t, i) => { if (round < 2 || i % 2 === round % 2) lines.push(t(p)); }));
    }
    // light shuffle so groups mix together
    for (let i = lines.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [lines[i], lines[j]] = [lines[j], lines[i]]; }
    return lines.map(cap).join(" ");
  }

  STORIES.push({ id: "garden", name: "Word Garden", emoji: "🌱", text: wordGarden() });

  const api = { STORIES, GROUPS, allText: () => STORIES.map((s) => s.text).join("\n\n") };
  root.LANG_CORPUS = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

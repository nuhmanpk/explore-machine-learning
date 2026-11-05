// Learning plans: curated routes through the course, built only from lesson ids in catalog.js.
// Self-paced paths (with progress + "Continue") and classroom plans (sessions for teachers).
// Load after catalog.js (and common.js in the browser). Exposes window.PLANS.
// Times are never hard-coded: a plan's total comes from each lesson's `time` in the catalog.
(function () {
  const root = typeof window !== "undefined" ? window : globalThis;

  // ---------- A. self-paced paths ----------
  // audience: any of "kids" | "teens" | "adults" | "teachers". icon: a name from ML.ICONS.
  // steps: [lesson id, goal ("Notice how..."), optional "try this" prompt]
  const PATHS = [
    {
      id: "first-hour", title: "Your first hour of ML", icon: "bulb", color: "#5b5fe0",
      audience: ["kids", "teens", "adults"], age: "Ages 8+ · no experience needed",
      why: "A tasting menu of the big ideas: learning from examples, finding groups, tiny brains, rewards, eyes, words and pictures.",
      steps: [
        ["intro-ml", "Notice how Robo never gets told the rule. It works it out from examples.", "Teach it a rule, then try to trick it with an odd example."],
        ["sup-line", "Notice how the line wiggles towards the dots a little at a time.", "Drag one dot far away and watch the line get pulled."],
        ["sup-fruit", "Notice how a new fruit takes the label of its closest neighbours.", "Change how many neighbours vote and see the borders smooth out."],
        ["unsup-kmeans", "Notice how groups appear even though nobody named them.", null],
        ["nn-neuron", "Notice how one neuron is just a weighted vote plus a nudge.", "Find weights that make it say yes only when both inputs are on."],
        ["nn-car", "Notice how cars that crash early still teach the next generation something.", "Let it run for 10 generations, then draw a new track."],
        ["rl-maze", "Notice how the mouse learns from rewards, not from a map.", null],
        ["vision-teach", "Notice how a few examples of each thing are enough to start.", "Teach it two hand signs and test it with a third person."],
        ["lang-tokens", "Notice how the computer reads chunks of words, not letters.", null],
        ["diff-noise", "Notice how making a picture is just un-fuzzing, one small step at a time.", null],
        ["ai-fails", "Notice how a smart-looking model can still be confidently wrong.", "Find one mistake and explain why the model made it."],
      ],
    },
    {
      id: "chatgpt", title: "How ChatGPT works", icon: "chat", color: "#e0a400",
      audience: ["teens", "adults", "teachers"], age: "Ages 11+",
      why: "Follow a sentence through a chatbot: chopped into tokens, placed on a word map, mixed with attention, sampled with temperature, polished by human feedback, then given tools.",
      steps: [
        ["lang-tokens", "Notice how common words are one token and rare words split into pieces.", "Type your name. How many tokens is it?"],
        ["lang-embed", "Notice how words with similar meanings sit close together on the map.", null],
        ["lang-attend", "Notice how each word looks back at the words that help explain it.", "Find a sentence where \"it\" points to the wrong thing."],
        ["lang-temp", "Notice how low temperature repeats safe words and high temperature gets wild.", "Find the temperature where the text is still sensible but surprising."],
        ["lang-follow", "Notice how the same model behaves differently once it has seen example instructions.", null],
        ["lang-rlhf", "Notice how human thumbs-up and thumbs-down reshape what the model prefers.", null],
        ["agent-loop", "Notice how an agent is a loop: think, act, look at what happened, repeat.", null],
        ["agent-tools", "Notice how picking the right tool beats guessing the answer.", null],
        ["agent-memory", "Notice how a small memory forces the agent to choose what to keep.", null],
        ["ethics-inject", "Notice how sneaky text can hijack a model that trusts everything it reads.", "Write a harmless trick that makes the bot ignore its first instruction."],
      ],
    },
    {
      id: "games", title: "Games that learn", icon: "gamepad", color: "#0e9fb5",
      audience: ["kids", "teens"], age: "Ages 8+",
      why: "Reinforcement learning, one game at a time. Watch players that start out clueless get good just from points and penalties.",
      steps: [
        ["rl-maze", "Notice how the reward slowly spreads back from the cheese to the start.", null],
        ["rl-bandit", "Notice the trade-off: keep the slot you know, or try a new one?", "Set exploring to zero. Does it ever find the best machine?"],
        ["rl-flappy", "Notice how many crashes it takes before the first good flight.", null],
        ["rl-snake", "Notice how the snake's habits change as it gets longer.", null],
        ["rl-hack", "Notice how a learner chases the score, even when that is not what you meant.", "Change the reward so the cheat stops paying off."],
        ["game-boat", "Notice how the boat learns to aim upstream to beat the current.", null],
        ["game-hoops", "Notice how each miss tells the shooter which way to adjust.", null],
        ["game-dino", "Notice when the dino starts jumping at the right moment, not just jumping.", null],
        ["game-rocket", "Notice how a soft landing is worth more than a fast one.", "Add wind and see how long it takes to adapt."],
        ["game-walker", "Notice how walking appears from random wiggles plus selection.", null],
        ["game-ants", "Notice how no single ant knows the best path, but the colony finds it.", null],
      ],
    },
    {
      id: "see-draw", title: "See and draw", icon: "palette", color: "#ff5c9a",
      audience: ["kids", "teens", "adults"], age: "Ages 10+",
      why: "From pixels to pictures and back: how computers see, describe what they see, then dream up brand new images and video.",
      steps: [
        ["vision-pixels", "Notice how a picture is just a grid of numbers to a computer.", null],
        ["vision-scan", "Notice how small pattern scanners light up on edges and shapes.", null],
        ["vision-teach", "Notice how the camera gets better with varied examples, not just more of the same.", null],
        ["vision-detect", "Notice how finding where something is is harder than saying what it is.", null],
        ["vlm-match", "Notice how words and pictures land in the same shared space.", null],
        ["vlm-caption", "Notice how the caption is built one word at a time while looking at the picture.", null],
        ["vlm-ask", "Notice how the question changes which part of the picture matters.", "Ask the same picture three different questions."],
        ["diff-noise", "Notice how adding noise is easy, and removing it is what the model must learn.", null],
        ["diff-train", "Notice how the samples go from fuzz to shapes as training goes on.", null],
        ["diff-guide", "Notice how a text prompt steers each un-fuzzing step.", "Turn guidance up high. What do you gain and what do you lose?"],
        ["diff-gan", "Notice how the forger and detective push each other to improve.", null],
        ["gen-compress", "Notice how squeezing a picture forces the model to keep only what matters.", null],
        ["gen-latent", "Notice how walking across the map morphs one picture smoothly into another.", null],
        ["gen-vae", "Notice how new pictures come from picking new spots on the map.", null],
        ["video-flow", "Notice how motion is just how pixels move from one frame to the next.", null],
        ["video-next", "Notice how small mistakes snowball as the model dreams frame after frame.", null],
        ["video-interp", "Notice how in-between frames are guessed from the motion either side.", null],
      ],
    },
    {
      id: "data-scientist", title: "Data scientist starter", icon: "layers", color: "#e0883a",
      audience: ["teens", "adults"], age: "Ages 13+",
      why: "The everyday toolkit: clean data, fair tests, honest scores, teams of models and careful tuning.",
      steps: [
        ["data-clean", "Notice how one messy value can drag a whole result off course.", null],
        ["data-scale", "Notice how a feature measured in big numbers can bully the small ones.", null],
        ["data-features", "Notice how a good clue beats a pile of useless ones.", null],
        ["data-sampling", "Notice how who you ask decides what answer you get.", null],
        ["sup-traintest", "Notice how a model can ace questions it has seen and fail new ones.", null],
        ["sup-overfit", "Notice the point where a wigglier model stops helping and starts memorising.", "Find the smallest model that still does well on the test dots."],
        ["sup-forest", "Notice how a tree is just a game of twenty questions.", null],
        ["sup-metrics", "Notice how accuracy can look great while the model misses what matters.", "Make a model with 95% accuracy that is still useless."],
        ["ens-wisdom", "Notice how many noisy guesses average out, unless they share the same bias.", null],
        ["ens-bagging", "Notice how trees trained on different samples disagree in useful ways.", null],
        ["ens-boost", "Notice how each new learner focuses on the last one's mistakes.", null],
        ["ens-compare", "Notice when bagging wins and when boosting wins.", null],
        ["opt-tune", "Notice how tuning knobs on the test set quietly cheats.", null],
        ["unsup-pca", "Notice how squashing many columns into two can still keep the shape.", null],
      ],
    },
    {
      id: "brains", title: "Build a brain", icon: "network", color: "#7c5cff",
      audience: ["teens", "adults"], age: "Ages 12+",
      why: "Open up a neural network: neurons, bends, learning rates, backprop and the tricks that stop it memorising.",
      steps: [
        ["nn-neuron", "Notice how weights decide how loudly each input votes.", null],
        ["nn-activation", "Notice how without a bend, stacking layers is still just a straight line.", "Switch the bend off and try to fit the curvy data."],
        ["nn-playground", "Notice how more neurons let the boundary bend in more places.", null],
        ["nn-lr", "Notice how a big learning rate overshoots and a tiny one crawls.", null],
        ["nn-backprop", "Notice how blame flows backwards from the error to every weight.", null],
        ["nn-dropout", "Notice how forgetting on purpose makes the network rely on more than one clue.", null],
        ["sup-overfit", "Notice how a perfect training score can be a warning sign.", null],
        ["opt-anneal", "Notice how a little randomness helps escape a bad valley.", null],
        ["opt-genetic", "Notice how evolution searches without any gradient at all.", null],
      ],
    },
    {
      id: "robots", title: "Robots & control", icon: "wrench", color: "#5c6b7a",
      audience: ["kids", "teens", "adults"], age: "Ages 10+",
      why: "How machines steer, balance, sense and plan in the real world, and where learning beats hand-written rules.",
      steps: [
        ["robo-pid", "Notice how reacting to the error, its history and its speed keeps things steady.", "Turn up only P. Why does it wobble?"],
        ["robo-arm", "Notice how angles at the joints decide where the hand ends up.", null],
        ["robo-sense", "Notice how blending a noisy sensor with a guess beats trusting either one.", null],
        ["robo-plan", "Notice how the planner trades a short path for a safe one.", null],
        ["ai-pathfinder", "Notice how search explores the most promising squares first.", null],
        ["rl-balance", "Notice how balance is learned from falling over, many times.", null],
        ["nn-car", "Notice how sensors become inputs and steering becomes the output.", null],
        ["game-arm", "Notice how the arm learns smooth moves without being told the maths.", null],
        ["game-drone", "Notice how the drone balances speed against wobble.", null],
        ["game-parking", "Notice how backing up is part of the plan, not a mistake.", null],
        ["game-lane", "Notice how small steering corrections beat big jerky ones.", null],
      ],
    },
    {
      id: "chance", title: "Maths of chance", icon: "dice", color: "#e0568b",
      audience: ["teens", "adults", "teachers"], age: "Ages 12+",
      why: "Probability is how machines handle not knowing. Then use it to read patterns in time and spot the odd one out.",
      steps: [
        ["prob-monte", "Notice how random darts get close to an exact number.", "How many darts until pi is right to two decimals?"],
        ["prob-clt", "Notice how averages of almost anything end up bell-shaped.", null],
        ["prob-bayes", "Notice how one new clue shifts your belief, but does not erase it.", null],
        ["prob-markov", "Notice how the next step depends only on where you are now.", null],
        ["ethics-calibrate", "Notice how \"90% sure\" should be right about 9 times in 10.", null],
        ["time-trend", "Notice how smoothing trades wiggles for delay.", null],
        ["time-season", "Notice the repeating pattern hiding under the noise.", null],
        ["time-forecast", "Notice how the forecast's uncertainty grows the further ahead you look.", null],
        ["time-anomaly", "Notice how odd means odd for this moment, not just a big number.", null],
      ],
    },
    {
      id: "responsible", title: "Responsible AI", icon: "heart", color: "#d9487c",
      audience: ["kids", "teens", "adults", "teachers"], age: "Ages 10+ · great for discussion",
      why: "Where AI goes wrong and what people do about it: fairness, explanations, honest confidence, cheating rewards, tricks and privacy.",
      steps: [
        ["ai-fails", "Notice the kinds of mistakes: odd inputs, missing data, false confidence.", null],
        ["data-sampling", "Notice how a lopsided sample builds a lopsided model.", null],
        ["ethics-bias", "Notice how a model can be accurate overall and unfair to one group.", "Change the data until both groups get the same error rate."],
        ["ethics-explain", "Notice which clues the model actually used for its answer.", null],
        ["ethics-calibrate", "Notice the gap between how sure the model sounds and how often it is right.", null],
        ["rl-hack", "Notice how a badly written goal gets followed to the letter.", null],
        ["ethics-inject", "Notice how instructions hidden in text can take over a model.", null],
        ["ai-privacy", "Notice what a model can remember or reveal about the people in its data.", "List three things you would never type into a chatbot."],
      ],
    },
    {
      id: "sampler", title: "Teacher's sampler", icon: "teacher", color: "#2f9bff",
      audience: ["teachers", "adults"], age: "For grown-ups planning lessons",
      why: "One lesson from every chapter, in course order. Skim the whole course and pick what fits your class.",
      steps: [
        ["intro-ml", "Notice the core loop every later lesson reuses: look, guess, check, tweak.", null],
        ["sup-fruit", "Notice how easy nearest-neighbours is to act out with real objects.", null],
        ["unsup-kmeans", "Notice how this works as an unplugged activity with sticky notes.", null],
        ["nn-car", "Notice this is the crowd-pleaser: a good hook for any session.", null],
        ["rl-maze", "Notice how reward, not instruction, drives the learning.", null],
        ["vision-teach", "Notice this uses the webcam: check your room setup first.", null],
        ["lang-tokens", "Notice how this demystifies chatbots in three minutes.", null],
        ["vlm-match", "Notice the link between words and pictures, which bridges to image generation.", null],
        ["diff-noise", "Notice how simple the core diffusion idea is to explain.", null],
        ["audio-ear", "Notice how sound becomes a picture before the model listens.", null],
        ["video-next", "Notice how errors compound, a good talking point.", null],
        ["ai-minimax", "Notice how this is classic AI with no learning at all, a useful contrast.", null],
        ["data-clean", "Notice how this makes data quality concrete for students.", null],
        ["time-forecast", "Notice how this links to weather and sales examples students know.", null],
        ["agent-loop", "Notice the agent loop students will hear about in the news.", null],
        ["ethics-bias", "Notice how this opens a fairness discussion with real numbers.", null],
        ["ens-wisdom", "Notice how this works as a whole-class jellybean guessing game.", null],
        ["gen-latent", "Notice how the map of pictures makes generative models feel tangible.", null],
        ["graph-pagerank", "Notice how this explains search engines with one simple idea.", null],
        ["robo-pid", "Notice the strong link to physics and engineering lessons.", null],
        ["opt-genetic", "Notice the link to biology and evolution.", null],
        ["prob-monte", "Notice the link to the maths curriculum: estimating pi.", null],
        ["game-rocket", "Notice how this makes a great end-of-session reward.", null],
      ],
    },
  ];

  // ---------- B. classroom plans ----------
  // Each session: objectives, an unplugged warm-up (no computer), lessons, discussion, exit ticket, differentiation.
  const CLASSES = [
    {
      id: "class-45", title: "Single 45-minute class", icon: "clock", color: "#2fbf62",
      audience: ["teachers", "kids", "teens"], age: "Ages 9–14 · one period",
      why: "One period that answers \"what is machine learning?\" with a hands-on warm-up and two short lessons.",
      sessions: [
        {
          title: "Machines that learn from examples", minutes: 45,
          objectives: ["Explain that ML finds rules from examples instead of being told them.", "Predict a label using nearest neighbours.", "Spot when a model is memorising instead of learning."],
          warmup: ["Human classifier (10 min)", "Hold up picture cards of animals one by one and say \"yes\" or \"no\" for a secret rule (e.g. has fur). Students guess the rule only from your answers, then you show a tricky card."],
          lessons: ["intro-ml", "sup-fruit", "sup-overfit"],
          discuss: ["How was guessing the secret rule like what Robo did?", "Why did some guesses go wrong?", "Where might an app near you be learning from examples?"],
          exit: "In one sentence: how is a learning program different from a normal program?",
          script: ["Today we are going to meet computers that learn, instead of computers that just follow orders.", "A normal program is a recipe a person writes. A learning program looks at lots of examples and finds the recipe itself.", "In the warm-up, you were the learning program: you found my secret rule just from my yes and no answers.", "Watch Robo do the same thing. Then we will see what happens when a program memorises instead of learning."],
          answer: "A normal program follows rules a person wrote; a learning program finds its own rules from examples (and gets better with more good examples).",
          younger: "Stay with intro-ml and sup-fruit; act out nearest neighbours by standing near classmates.",
          older: "Add sup-traintest and ask why we hide some data from the model.",
        },
      ],
    },
    {
      id: "club-5", title: "5-session after-school club", icon: "groups", color: "#ff8a3d",
      audience: ["teachers", "kids", "teens"], age: "Ages 9–13 · 5 × 60 min",
      why: "A week-by-week club: examples, brains, rewards, words, then making pictures and making it fair.",
      sessions: [
        {
          title: "Learning from examples", minutes: 60,
          objectives: ["Describe the look-guess-check-tweak loop.", "Sort new things by their closest examples.", "Tell training data from test data."],
          warmup: ["Sorting hat", "Give groups a pile of mixed buttons or leaves. They invent groups without being told how, then explain their rule to another group."],
          lessons: ["intro-ml", "sup-fruit", "sup-traintest", "unsup-kmeans"],
          discuss: ["Did two groups invent the same rule? Why not?", "What makes a good example?"],
          exit: "Name one thing a computer could learn from examples, and the examples you would give it.",
          script: ["Welcome to ML club! Every lesson this week uses one loop: look, guess, check, tweak.", "When you sorted the buttons, nobody told you the groups. You found them. Computers can do that too.", "Some computers learn with answers (labels). Some find groups with no answers at all.", "We always hide a few examples from the computer to test it fairly, like a surprise quiz."],
          answer: "Any sensible pair, e.g. 'tell cats from dogs' with many labelled photos of cats and dogs. Good answers mention lots of varied examples.",
          younger: "Skip sup-traintest; spend longer on the sorting game.",
          older: "Add sup-overfit and connect it to cramming for a test.",
        },
        {
          title: "Tiny brains", minutes: 60,
          objectives: ["Explain a neuron as a weighted vote.", "See a network improve over generations.", "Describe what a learning rate does."],
          warmup: ["Human neuron", "Three students are inputs holding cards (0 or 1). A fourth is the neuron who multiplies each by a weight on the board, adds them up and stands if the total passes a line."],
          lessons: ["nn-neuron", "nn-playground", "nn-car"],
          discuss: ["Why did the early cars crash?", "What changed between generation 1 and 10?"],
          exit: "What does a weight do in a neuron?",
          script: ["Your brain has billions of tiny cells called neurons. Computers copy a very simple version.", "A neuron listens to its inputs, decides how much each one matters (the weight), adds them up and decides yes or no.", "Lots of neurons together can learn surprising things, like how to drive a car around a track.", "Watch the first cars crash. That is not failure, that is how they learn."],
          answer: "A weight says how much an input matters: a big weight means that input counts a lot, a weight near zero means it is mostly ignored.",
          younger: "Focus on nn-car and let them draw tracks.",
          older: "Add nn-lr and race different learning rates.",
        },
        {
          title: "Learning from rewards", minutes: 60,
          objectives: ["Explain reward and penalty in reinforcement learning.", "Describe the explore-or-exploit choice.", "Spot reward hacking."],
          warmup: ["Hot and cold", "One student leaves the room, the class hides an object, and the student finds it using only \"warmer\" and \"colder\". Then repeat with silly rewards (clap for walking backwards)."],
          lessons: ["rl-maze", "rl-bandit", "rl-hack", "game-rocket"],
          discuss: ["How was hot-and-cold like the mouse in the maze?", "What happened when the reward was silly?"],
          exit: "Write a reward for a robot that cleans your room. How could it cheat?",
          script: ["Today the computer learns like a pet: it gets a treat for good moves and nothing for bad ones.", "Nobody tells it the right answer. It tries things and remembers what earned points.", "It has to choose: do the thing that worked before, or try something new that might be better?", "Be careful what you reward. A computer will find the sneakiest way to get points."],
          answer: "Example: 'a point for every bit of rubbish picked up'. It could cheat by tipping rubbish out and picking it up again. Fix: reward a clean floor at the end, not each pick-up.",
          younger: "Swap rl-hack for game-dino.",
          older: "Ask them to tune the bandit's exploring and record results in a table.",
        },
        {
          title: "Talking machines", minutes: 60,
          objectives: ["Explain tokens and word maps.", "Describe how temperature changes text.", "Say why chatbots can be wrong."],
          warmup: ["Finish my sentence", "Go around the circle; each student adds one word to a story. Then try again but everyone must pick the most likely word. Compare the two stories."],
          lessons: ["lang-tokens", "lang-embed", "lang-temp", "ai-fails"],
          discuss: ["Which story was more fun? Which made more sense?", "Is a chatbot thinking, or picking likely words?"],
          exit: "What does turning up the temperature do?",
          script: ["Chatbots do not read letters like we do. They chop text into chunks called tokens.", "They keep a giant map where words with similar meanings sit close together.", "When they write, they pick the next word, then the next. Temperature decides how adventurous each pick is.", "Chatbots sound sure even when they are wrong, so we always check important facts."],
          answer: "Higher temperature makes the model pick less likely words: more surprising and creative, but also more random and more mistakes.",
          younger: "Do lang-tokens and lang-temp only.",
          older: "Add lang-attend and lang-rlhf.",
        },
        {
          title: "Make pictures, make it fair", minutes: 60,
          objectives: ["Explain diffusion as un-fuzzing noise.", "Recognise bias in a dataset.", "Share one thing learned with the group."],
          warmup: ["Fuzzy drawing", "Show a picture through several sheets of tracing paper and remove one at a time; students guess what it is at each step."],
          lessons: ["diff-noise", "diff-guide", "ethics-bias"],
          discuss: ["Who should check that AI is fair?", "What was your favourite lesson in the club and why?"],
          exit: "One thing you will tell your family about how AI learns.",
          script: ["Image makers start with pure fuzz and remove a little noise at a time until a picture appears.", "Words in a prompt steer each step towards what you asked for.", "AI learns from data made by people, so it can copy people's unfairness too.", "Let's finish by sharing what we learned and how we would make AI fair."],
          answer: "Any honest takeaway, e.g. 'computers learn from lots of examples' or 'AI can be unfair if its examples are unfair'.",
          younger: "Skip diff-guide; finish with a game of the class's choice.",
          older: "Add ethics-explain and hold a short debate.",
        },
      ],
    },
    {
      id: "camp-5", title: "Week-long ML camp (5 days)", icon: "rocket", color: "#7c5cff",
      audience: ["teachers", "kids", "teens"], age: "Ages 10–15 · 5 days × 3 h",
      why: "A full week with a theme each day and time to play. Ends with a mini showcase where campers teach a lesson to parents.",
      sessions: [
        {
          title: "Day 1: Data and examples", minutes: 180,
          objectives: ["Use the ML loop vocabulary.", "Clean and sample data fairly.", "Compare supervised and unsupervised learning."],
          warmup: ["Class survey", "Campers survey each other about favourite snacks, then discover the survey only asked one table. What went wrong?"],
          lessons: ["intro-ml", "sup-line", "sup-fruit", "data-clean", "data-sampling", "unsup-kmeans", "unsup-dbscan"],
          discuss: ["Why does who you ask matter?", "When would you not know the labels?"],
          exit: "Draw the look-guess-check-tweak loop from memory.",
          script: ["Welcome to ML camp! This week every lesson uses one loop: look, guess, check, tweak.", "Data is the examples a computer learns from. Messy or one-sided data makes a messy or one-sided model.", "Sometimes we give the right answers (supervised). Sometimes the computer finds groups by itself (unsupervised).", "Today's job: become data detectives."],
          answer: "A loop of four steps: look at examples, make a guess, check how wrong it was, tweak a little, then repeat.",
          younger: "Skip data-sampling and unsup-dbscan.",
          older: "Add sup-metrics and unsup-pca.",
        },
        {
          title: "Day 2: Brains and eyes", minutes: 180,
          objectives: ["Explain neurons, layers and backprop in plain words.", "Train a camera classifier.", "Describe what pattern scanners look for."],
          warmup: ["Pixel art by numbers", "Campers colour a grid using a list of numbers, then swap lists and see that a picture is just numbers."],
          lessons: ["nn-neuron", "nn-activation", "nn-car", "nn-backprop", "vision-pixels", "vision-scan", "vision-teach"],
          discuss: ["What surprised you about how the camera sees?", "How could the camera classifier be fooled?"],
          exit: "Why do neural networks need a bend (activation)?",
          script: ["A picture is just a grid of numbers. Computers find patterns in those numbers.", "A neural network is layers of simple neurons. Each one passes a signal to the next.", "Backprop is how it learns: the error is sent backwards and every weight gets a tiny nudge.", "Today you will train a camera to recognise things you choose."],
          answer: "Without a bend (activation), stacking layers still only makes straight lines. The bend lets the network learn curvy, complicated patterns.",
          younger: "Skip nn-backprop and nn-activation; add vision-guess.",
          older: "Add nn-dropout and vision-detect.",
        },
        {
          title: "Day 3: Games that learn", minutes: 180,
          objectives: ["Design rewards for an agent.", "Explain exploring vs exploiting.", "Compare learning by evolution and by reward."],
          warmup: ["Robot instructions", "Pairs give blindfolded partners step-by-step instructions to reach a target, then try again giving only \"good\" or \"bad\" after each step."],
          lessons: ["rl-maze", "rl-bandit", "rl-hack", "game-boat", "game-rocket", "game-walker", "game-ants"],
          discuss: ["Which way of guiding the robot was faster? Why?", "Which game took longest to learn and why?"],
          exit: "Describe one reward that could be hacked and how to fix it.",
          script: ["Today the players start out clueless and learn just from points and penalties.", "They must balance exploring new moves with using moves that already work.", "Some games learn by reward, others by evolution: keep the best players and mix them.", "Watch for cheating: learners chase the score, not what we meant."],
          answer: "Example: 'points for staying alive' in a racing game. The car can just park. Fix: reward progress along the track as well.",
          younger: "More time on the games; skip rl-hack.",
          older: "Add opt-genetic and compare it with rl-maze.",
        },
        {
          title: "Day 4: Language and agents", minutes: 180,
          objectives: ["Trace a sentence through tokens, embeddings and attention.", "Explain how agents use tools.", "Recognise prompt injection."],
          warmup: ["Word map on the floor", "Lay word cards on the floor; campers place similar words near each other and argue about the edge cases."],
          lessons: ["lang-tokens", "lang-embed", "lang-attend", "lang-temp", "lang-rlhf", "agent-loop", "agent-tools", "ethics-inject"],
          discuss: ["Is the floor map like the model's word map?", "Should a chatbot agent be allowed to send emails for you?"],
          exit: "Name the steps an agent repeats in its loop.",
          script: ["A chatbot turns words into tokens, places them on a word map, and uses attention to see which words matter.", "It writes by picking one likely next word at a time.", "Agents go further: they think, use a tool, look at the result and repeat.", "Because they trust text they read, sneaky text can trick them. That is called prompt injection."],
          answer: "Think (decide what to do), act (use a tool or take a step), look (check the result), then repeat until the job is done.",
          younger: "Do lang-tokens, lang-embed, lang-temp and agent-loop.",
          older: "Add agent-memory and agent-plan.",
        },
        {
          title: "Day 5: Create, be fair, show off", minutes: 180,
          objectives: ["Explain how images are generated.", "Discuss fairness and privacy.", "Teach one lesson to someone else."],
          warmup: ["Fuzzy drawing", "Reveal a picture by peeling away layers of tracing paper; guess at each step."],
          lessons: ["diff-noise", "diff-guide", "gen-latent", "ethics-bias", "ai-privacy", "ai-fails"],
          discuss: ["What makes AI fair?", "What would you want an AI to never do?"],
          exit: "Your one-minute pitch: the lesson you will show at the showcase and why.",
          script: ["Image makers turn noise into pictures step by step, guided by your words.", "AI can be unfair if its examples are unfair, and it can reveal private data if we are careless.", "The best way to check you understand something is to teach it.", "Today you become the teacher at our showcase."],
          answer: "A clear lesson choice plus one reason, e.g. 'Rocket Lander, because you can see it learn from crashing'.",
          younger: "Showcase in pairs, using any game from the week.",
          older: "Showcase with a short explanation of the model inside (use the Meet the model card).",
        },
      ],
    },
    {
      id: "society-3", title: "AI & society mini-unit", icon: "flag", color: "#d9487c",
      audience: ["teachers", "teens", "adults"], age: "Ages 13+ · 3 × 50 min",
      why: "For citizenship, computing or PSHE classes: how AI fails, who it treats unfairly, and how to stay safe with it.",
      sessions: [
        {
          title: "When AI gets it wrong", minutes: 50,
          objectives: ["Classify common AI failure types.", "Explain overconfidence and calibration."],
          warmup: ["Confidence line", "Read out trivia questions; students stand on a line from 50% to 100% sure, then check answers and see if the 90% group was right 9 times in 10."],
          lessons: ["ai-fails", "ethics-calibrate", "sup-overfit"],
          discuss: ["Is a confident wrong answer worse than an unsure one?", "Who is responsible when AI makes a mistake?"],
          exit: "Give an example of an AI being confidently wrong.",
          script: ["AI is useful, but it makes mistakes. Some are funny, some are serious.", "A common problem: the AI sounds very sure when it is actually wrong.", "A well-calibrated model that says 90% sure should be right about 9 times out of 10.", "Today we learn to spot when to trust AI and when to double-check."],
          answer: "Any real or plausible case, e.g. a chatbot inventing a fake book title, or an image classifier labelling a husky as a wolf because of snow in the background.",
          younger: "Use only ai-fails and the confidence line.",
          older: "Add prob-bayes and talk about updating beliefs.",
        },
        {
          title: "Fairness and explanations", minutes: 50,
          objectives: ["Show how biased data leads to biased models.", "Use an explanation to find which clues a model used."],
          warmup: ["Unfair hiring game", "Groups pick a team using only past winners' photos and notice who is missing."],
          lessons: ["data-sampling", "ethics-bias", "ethics-explain"],
          discuss: ["Can a model be accurate and unfair at the same time?", "Should people always get an explanation?"],
          exit: "One way to make a model fairer.",
          script: ["Models learn from past data. If the past was unfair, the model can be too.", "A model can be right most of the time and still be wrong much more often for one group.", "Explanations show which clues a model used, which helps us find hidden problems.", "Today: can we spot unfairness and fix it?"],
          answer: "Collect more balanced data, remove clues that stand in for a group, check error rates for each group, or have humans review decisions.",
          younger: "Skip ethics-explain; spend more time on the hiring game.",
          older: "Debate: should schools use AI to grade essays?",
        },
        {
          title: "Safety, tricks and privacy", minutes: 50,
          objectives: ["Explain prompt injection and reward hacking.", "Decide what personal data is safe to share."],
          warmup: ["Literal genie", "The teacher grants wishes exactly as worded; students rewrite wishes until they cannot be misread."],
          lessons: ["rl-hack", "ethics-inject", "ai-privacy"],
          discuss: ["How was the genie like reward hacking?", "What rules should apps follow with your data?"],
          exit: "Write a one-line privacy rule you will follow with chatbots.",
          script: ["AI follows the goal we give it, word for word, just like a genie.", "Sneaky text can take over a chatbot: that is prompt injection.", "Anything you type may be stored and learned from, so think before you share.", "Today we make our own rules for staying safe with AI."],
          answer: "A clear rule, e.g. 'I never share my address, passwords or other people's secrets with a chatbot.'",
          younger: "Skip ethics-inject; focus on ai-privacy.",
          older: "Add agent-tools and discuss what an agent should be allowed to do.",
        },
      ],
    },
  ];

  // ---------- helpers (work in Node too) ----------
  const AUDIENCES = [["kids", "Kids"], ["teens", "Teens"], ["adults", "Adults"], ["teachers", "Teachers"]];
  function lessonIndex(catalog) {
    const map = new Map();
    (catalog || []).forEach((t, ci) => t.demos.forEach((d, i) => map.set(d.id, { d, t, chapter: ci, no: i + 1 })));
    return map;
  }
  const lessonIds = (plan) => plan.steps ? plan.steps.map((s) => s[0]) : [...new Set(plan.sessions.flatMap((s) => s.lessons))];
  const minutesOf = (d) => parseInt(d.time, 10) || 0;
  // Self-paced: sum of lesson times. Classroom: sum of session lengths.
  function totalMinutes(plan, idx) {
    if (plan.sessions) return plan.sessions.reduce((a, s) => a + s.minutes, 0);
    return plan.steps.reduce((a, [id]) => a + (idx.has(id) ? minutesOf(idx.get(id).d) : 0), 0);
  }
  // Every problem as text: unknown lesson ids, duplicate plan ids, unknown audiences.
  function validate(catalog) {
    const idx = lessonIndex(catalog), problems = [], seen = new Set();
    for (const p of [...PATHS, ...CLASSES]) {
      if (seen.has(p.id)) problems.push(`Duplicate plan id "${p.id}"`);
      seen.add(p.id);
      p.audience.forEach((a) => { if (!AUDIENCES.some(([k]) => k === a)) problems.push(`Plan "${p.id}": unknown audience "${a}"`); });
      lessonIds(p).forEach((id) => { if (!idx.has(id)) problems.push(`Plan "${p.id}": lesson "${id}" is not in CATALOG`); });
    }
    return problems;
  }
  root.PLANS = { paths: PATHS, classes: CLASSES, audiences: AUDIENCES, validate, totalMinutes, lessonIndex, lessonIds };

  // ---------- page (plans.html only) ----------
  if (typeof document === "undefined" || !document.getElementById("plans-app") || !root.ML || !root.CATALOG) return;
  validate(root.CATALOG).forEach((m) => console.warn("[plans] " + m));

  const ML = root.ML, icon = ML.icon, IDX = lessonIndex(root.CATALOG);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmt = (m) => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}`;
  const known = (ids) => ids.filter((id) => IDX.has(id));
  const audChips = (p) => p.audience.map((a) => `<span class="chip">${AUDIENCES.find(([k]) => k === a)?.[1] || a}</span>`).join("");
  const lessonLink = (id) => {
    const L = IDX.get(id);
    return `<a class="pl-lesson" href="demos/${id}.html" style="--c:${L.t.color}"><span class="pl-l-ic">${icon(L.d.icon)}</span><span><b>${esc(L.d.name)}</b><small>${L.chapter}.${L.no} · ${esc(L.d.time)}</small></span>${ML.progress.isDone(id) ? `<span class="pl-check" title="You finished this lesson">${icon("check")}<span class="sr-only">Done</span></span>` : ""}</a>`;
  };

  function head(p, kind) {
    const ids = known(lessonIds(p));
    const mins = totalMinutes(p, IDX);
    const meta = kind === "path"
      ? `<span class="chip accent">${icon("clock")} ${fmt(mins)}</span><span class="chip accent">${icon("book")} ${ids.length} lessons</span>`
      : `<span class="chip accent">${icon("clock")} ${p.sessions.length > 1 ? `${p.sessions.length} sessions · ${fmt(mins)}` : fmt(mins)}</span><span class="chip accent">${icon("book")} ${ids.length} lessons</span>`;
    return `<div class="pl-head">
        <div class="t-emoji">${icon(p.icon)}</div>
        <div class="pl-title"><h3 id="${p.id}-h">${esc(p.title)}</h3><p class="pl-age">${esc(p.age)}</p></div>
      </div>
      <p class="pl-why">${esc(p.why)}</p>
      <div class="t-meta">${meta}${audChips(p)}</div>`;
  }

  function pathCard(p) {
    const ids = known(lessonIds(p));
    const done = ids.filter((id) => ML.progress.isDone(id)).length;
    const next = ids.find((id) => !ML.progress.isDone(id));
    const cta = next
      ? `<a class="btn primary pl-cta" href="demos/${next}.html">${icon("play")} <span>${done ? "Continue" : "Start"}<span class="sr-only"> ${esc(p.title)}</span>: ${esc(IDX.get(next).d.name)}</span></a>`
      : `<a class="btn" href="demos/${ids[0]}.html">${icon("trophy")} Path complete! Start again</a>`;
    const steps = p.steps.filter(([id]) => IDX.has(id)).map(([id, goal, tryThis], i) => {
      const L = IDX.get(id), on = ML.progress.isDone(id);
      return `<li class="pl-step${on ? " done" : ""}${id === next ? " next" : ""}" style="--c:${L.t.color}">
        <span class="pl-num" aria-hidden="true">${on ? icon("check") : i + 1}</span>
        <div>
          <a href="demos/${id}.html"><b>${esc(L.d.name)}</b></a> <span class="pl-sub">${esc(L.t.name)} · ${esc(L.d.time)}${on ? " · done" : ""}</span>
          <p>${esc(goal)}</p>
          ${tryThis ? `<p class="pl-try">${icon("flask")} <span><b>Try this:</b> ${esc(tryThis)}</span></p>` : ""}
        </div>
      </li>`;
    }).join("");
    return `<article class="plan card" id="${p.id}" data-kind="path" data-aud="${p.audience.join(" ")}" data-min="${totalMinutes(p, IDX)}" style="--c:${p.color}" aria-labelledby="${p.id}-h" tabindex="-1">
      ${head(p, "path")}
      ${ML.progress.bar(`Progress in ${p.title}`, done, ids.length)}
      <div class="pl-actions">${cta}
        <button type="button" class="btn ghost pl-toggle" aria-expanded="false" aria-controls="${p.id}-body">${icon("arrow-down")} <span>Show the steps</span></button>
      </div>
      <div class="pl-body" id="${p.id}-body" hidden><ol class="pl-steps">${steps}</ol></div>
    </article>`;
  }

  function classCard(p) {
    const sessions = p.sessions.map((s, i) => `<section class="pl-session" aria-labelledby="${p.id}-s${i}">
        <h4 id="${p.id}-s${i}"><span class="pl-num" aria-hidden="true">${i + 1}</span> ${esc(s.title)} <span class="chip">${icon("clock")} ${fmt(s.minutes)}</span></h4>
        <div class="pl-grid">
          <div class="pl-box"><h5>${icon("target")} Learning objectives</h5><ul>${s.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>
          <div class="pl-box"><h5>${icon("groups")} Warm-up, no computer: ${esc(s.warmup[0])}</h5><p>${esc(s.warmup[1])}</p></div>
          <div class="pl-box pl-wide"><h5>${icon("gamepad")} Lessons to use</h5><div class="pl-lessons">${known(s.lessons).map(lessonLink).join("")}</div></div>
          <div class="pl-box"><h5>${icon("chat")} Discussion questions</h5><ul>${s.discuss.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></div>
          <div class="pl-box pl-exit"><h5>${icon("flag")} Exit ticket</h5><p>${esc(s.exit)}</p>
            ${s.answer ? `<details class="pl-more"><summary>${icon("check")} Answer key</summary><p>${esc(s.answer)}</p></details>` : ""}</div>
          ${s.script ? `<details class="pl-more pl-wide pl-script"><summary>${icon("teacher")} Teacher script: ready-to-read talking points</summary><ol>${s.script.map((l) => `<li>${esc(l)}</li>`).join("")}</ol></details>` : ""}
          <div class="pl-box pl-wide"><h5>${icon("layers")} Differentiation</h5><p><b>Younger or newer:</b> ${esc(s.younger)}</p><p><b>Older or faster:</b> ${esc(s.older)}</p></div>
        </div>
      </section>`).join("");
    return `<article class="plan card" id="${p.id}" data-kind="class" data-aud="${p.audience.join(" ")}" data-min="${totalMinutes(p, IDX)}" style="--c:${p.color}" aria-labelledby="${p.id}-h" tabindex="-1">
      ${head(p, "class")}
      <div class="pl-actions">
        <button type="button" class="btn ghost pl-toggle" aria-expanded="false" aria-controls="${p.id}-body">${icon("arrow-down")} <span>Show the sessions</span></button>
        <button type="button" class="btn ghost pl-print" data-print="${p.id}">${icon("book")} Print this plan</button>
      </div>
      <div class="pl-body" id="${p.id}-body" hidden>${sessions}</div>
    </article>`;
  }

  const app = document.getElementById("plans-app");
  document.getElementById("paths").innerHTML = PATHS.map(pathCard).join("");
  document.getElementById("classes").innerHTML = CLASSES.map(classCard).join("");

  // Expand / collapse. Opening a plan also puts it in the address bar so it can be shared.
  function setOpen(card, open, remember) {
    const btn = card.querySelector(".pl-toggle"), body = card.querySelector(".pl-body");
    btn.setAttribute("aria-expanded", open);
    body.hidden = !open;
    btn.querySelector("span").textContent = (open ? "Hide the " : "Show the ") + (card.dataset.kind === "path" ? "steps" : "sessions");
    btn.querySelector("svg").outerHTML = icon(open ? "arrow-up" : "arrow-down");
    if (remember && history.replaceState) {
      const u = new URL(location.href);
      if (open) u.searchParams.set("p", card.id); else if (u.searchParams.get("p") === card.id) u.searchParams.delete("p");
      history.replaceState(null, "", u);
    }
  }
  app.addEventListener("click", (e) => {
    const t = e.target.closest(".pl-toggle");
    if (t) { const c = t.closest(".plan"); setOpen(c, c.querySelector(".pl-body").hidden, true); return; }
    const pr = e.target.closest(".pl-print");
    if (pr) {
      const c = document.getElementById(pr.dataset.print);
      document.body.dataset.print = c.id;
      c.classList.add("print-me");
      window.print();
    }
  });
  // Paper copies show everything: open every plan body and every <details> while printing.
  let reopen = [];
  window.addEventListener("beforeprint", () => {
    reopen = [...document.querySelectorAll(".pl-more:not([open])")];
    reopen.forEach((d) => (d.open = true));
  });
  window.addEventListener("afterprint", () => {
    reopen.forEach((d) => (d.open = false));
    reopen = [];
    delete document.body.dataset.print;
    document.querySelectorAll(".print-me").forEach((el) => el.classList.remove("print-me"));
  });

  // Filters: audience + time budget (the plan's whole length must fit).
  const filters = document.getElementById("plan-filters");
  function applyFilters() {
    const aud = filters.querySelector('input[name="aud"]:checked').value;
    const max = +filters.querySelector('input[name="time"]:checked').value;
    let shown = { path: 0, class: 0 };
    document.querySelectorAll(".plan").forEach((c) => {
      const ok = (aud === "all" || c.dataset.aud.split(" ").includes(aud)) && (!max || +c.dataset.min <= max);
      c.classList.toggle("hidden", !ok);
      if (ok) shown[c.dataset.kind]++;
    });
    document.getElementById("paths-empty").classList.toggle("hidden", shown.path > 0);
    document.getElementById("classes-empty").classList.toggle("hidden", shown.class > 0);
    document.getElementById("plan-count").textContent = `${shown.path + shown.class} of ${PATHS.length + CLASSES.length} plans shown`;
  }
  filters.addEventListener("change", applyFilters);
  document.getElementById("plan-reset").addEventListener("click", () => {
    filters.querySelector('input[name="aud"][value="all"]').checked = true;
    filters.querySelector('input[name="time"][value="0"]').checked = true;
    applyFilters();
  });
  applyFilters();

  // Overall summary in the hero: which path is closest to done.
  {
    const best = PATHS.map((p) => { const ids = known(lessonIds(p)); return { p, done: ids.filter((id) => ML.progress.isDone(id)).length, total: ids.length }; })
      .filter((x) => x.done && x.done < x.total).sort((a, b) => b.done / b.total - a.done / a.total)[0];
    if (best) ML.say(`You are <b>${best.done} of ${best.total}</b> lessons into <b>${esc(best.p.title)}</b>. Keep going!`);
  }

  // "Not sure where to start?" picker: age + time + interest -> best plan (and a runner-up).
  const INTERESTS = {
    all: ["first-hour", "sampler"], games: ["games", "robots"], chat: ["chatgpt"], pictures: ["see-draw"],
    brains: ["brains", "first-hour"], data: ["data-scientist", "chance"], fair: ["responsible"],
  };
  const AGE_AUD = { u10: ["kids"], mid: ["kids", "teens"], teen: ["teens", "adults"], adult: ["adults"], teacher: ["teachers"] };
  function openPlan(card) {
    if (card.classList.contains("hidden")) document.getElementById("plan-reset").click();
    setOpen(card, true, true);
    card.scrollIntoView({ block: "start", behavior: "smooth" });
    card.focus({ preventScroll: true });
  }
  const picker = document.getElementById("plan-picker");
  if (picker) {
    picker.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = (n) => (picker.querySelector(`input[name="${n}"]:checked`) || {}).value;
      const age = v("q-age"), time = +v("q-time"), like = v("q-like");
      const out = document.getElementById("pick-out");
      if (!age || !like || Number.isNaN(time)) { out.innerHTML = `<p class="pick-msg">Answer all three questions and I will pick a plan for you.</p>`; return; }
      const pool = [...PATHS, ...(age === "teacher" ? CLASSES : [])];
      const fav = INTERESTS[like] || [];
      const scored = pool.map((p) => {
        const mins = totalMinutes(p, IDX);
        let s = 0;
        if (fav.includes(p.id)) s += fav[0] === p.id ? 6 : 4;
        if (p.audience.some((a) => AGE_AUD[age].includes(a))) s += 3; else s -= 4;
        if (!time || mins <= time) s += 2; else s -= Math.min(4, (mins - time) / 20);
        if (age === "teacher" && p.sessions && (!time || mins <= time)) s += 1;
        return { p, s, mins };
      }).sort((a, b) => b.s - a.s);
      const [best, next] = scored;
      const card = (x, lead) => `<div class="pick-card" style="--c:${x.p.color}"><div class="t-emoji">${icon(x.p.icon)}</div>
        <div><small>${lead}</small><h3>${esc(x.p.title)}</h3><p>${esc(x.p.why)}</p>
        <span class="chip accent">${icon("clock")} ${fmt(x.mins)}</span>
        <button type="button" class="btn small primary pl-cta" data-open="${x.p.id}">${icon("arrow-right")} Open this plan</button></div></div>`;
      out.innerHTML = card(best, "Try this one") + (next ? card(next, "Or maybe") : "");
      ML.say(`I picked <b>${esc(best.p.title)}</b> for you. Open it and follow the steps!`);
    });
    document.getElementById("pick-out").addEventListener("click", (e) => {
      const b = e.target.closest("[data-open]");
      if (b) openPlan(document.getElementById(b.dataset.open));
    });
  }

  // Deep link: plans.html?p=<id> opens that plan and scrolls to it.
  const want = new URLSearchParams(location.search).get("p");
  const target = want && document.getElementById(want);
  if (target && target.classList.contains("plan")) {
    if (target.classList.contains("hidden")) document.getElementById("plan-reset").click();
    setOpen(target, true, false);
    requestAnimationFrame(() => { target.scrollIntoView({ block: "start" }); target.focus({ preventScroll: true }); });
  } else if (want) console.warn(`[plans] No plan called "${want}"`);
})();

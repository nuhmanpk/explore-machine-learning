<div align="center">

# [Explore Machine Learning](https://nuhmanpk.github.io/explore-machine-learning/)

### How do machine learning models *actually* learn?

https://nuhmanpk.github.io/explore-machine-learning/

A hands-on, kid-friendly course you can **watch happen** in your browser.
Cars learn to drive, a mouse learns a maze, a rocket learns to land, and you can open up every model to see what it learned.

[![Made with HTML, CSS and JS](https://img.shields.io/badge/made%20with-HTML%20%C2%B7%20CSS%20%C2%B7%20JS-ff8a3d?style=flat-square)](#tech)
[![No build step](https://img.shields.io/badge/build%20step-none-2fbf62?style=flat-square)](#run-it-locally)
[![Runs in your browser](https://img.shields.io/badge/runs%20in-your%20browser-7c5cff?style=flat-square)](#run-it-locally)

[**GitHub**](https://github.com/nuhmanpk) · [**Kaggle**](https://www.kaggle.com/nuhmanpk) · [**Hugging Face**](https://huggingface.co/nuhmanpk) · [**Buy me GPU credits**](https://www.buymeacoffee.com/nuhmanpk)

</div>

---

## What is this?

Most machine learning explainers show diagrams. This one shows **learning itself**.

Every lesson is a live simulation where a real algorithm runs in your browser. You watch a model start out terrible, make mistakes, and slowly get good. Then you make it harder (add wind, block a path, change your habits) and watch it **adapt**.

It's written so a five-year-old can follow the story, while the **"For grown-ups"** section of every lesson names the real algorithms and the maths.

- **100 lessons**: a starting lesson plus **22 chapters**, in a syllabus order: from "what is machine learning?" up to language models, vision-language models, diffusion, video, the wider world of AI, data, forecasting, agents, AI ethics, ensembles, generative models, graphs, robotics, optimisation and probability.
- **Everything is interactive.** Drag, draw, drive, kick, break things.
- **Every model is open.** A built-in **Model X-ray** shows which signals a trained model pays attention to, the rules it discovered, a decision map, and a what-if lab.
- **Real learning, no fakes.** Q-learning, neuroevolution, backpropagation, k-means, decision trees, ant colony optimisation, diffusion, CLIP and more all run live.
- **Nothing downloads by default.** Lessons that need a big pretrained model show a button that tells you the size first.

## How each lesson works

Every lesson follows the same pattern, inspired by watching a self-driving car learn:

| Part | What it gives you |
|---|---|
| **Play first** | Try the task yourself (drive the car, balance the pole, kick a penalty) so you feel why it is hard. |
| **Watch it learn** | A live loop with a progress chart climbing as the model improves. |
| **Checkpoints** | Saved snapshots of the model along the way. Tap one to replay how good it was *back then*. |
| **What's happening inside** | A live card that explains which signal triggered which decision, in plain words. |
| **Challenges** | Wind, ice, a blocked path, a new habit. The chart marks the moment it hits and you watch the model adapt. |
| **Meet the model** | The model's friendly name, its real name, and how it learns in three steps. |
| **Model X-ray** | After training, open the model: what it watches, the rules it found, a decision map, a what-if lab. |
| **What just happened?** | A short recap, then a "For grown-ups" section with the real terms. |

## The course

### [Start here](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=intro)

_What is machine learning, and how is it different from normal programs?_

- **0.1 [What is Machine Learning?](https://nuhmanpk.github.io/explore-machine-learning/demos/intro-ml.html)** — Teach Robo a secret rule just by showing examples. Watch its guesses go from random to right, one example at a time.

### Chapter 1 · [Learning from Examples](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=sup)

_Supervised learning: every example comes with the right answer._

- **1.1 [Line Fitter](https://nuhmanpk.github.io/explore-machine-learning/demos/sup-line.html)** — Linear regression: hotter days, more ice-cream. Watch a line wiggle step by step until it fits the dots best.
- **1.2 [Nearest Neighbours](https://nuhmanpk.github.io/explore-machine-learning/demos/sup-fruit.html)** — Drop apples and lemons on the table. To guess a new fruit, Robo asks its closest neighbours and lets them vote.
- **1.3 [Twenty Questions Trees](https://nuhmanpk.github.io/explore-machine-learning/demos/sup-forest.html)** — Decision trees and random forests: watch a tree ask yes/no questions one by one, then plant a whole forest that votes.
- **1.4 [Memoriser vs Learner](https://nuhmanpk.github.io/explore-machine-learning/demos/sup-overfit.html)** — Slide a wiggle knob and watch a model go from too simple, to just right, to memorising every dot. Why does a perfect score on the examples fail on new ones?
- **1.5 [Train vs Test](https://nuhmanpk.github.io/explore-machine-learning/demos/sup-traintest.html)** — Hide some examples, teach the model with the rest, then grade it on the ones it never saw. See why a model must be tested on new things.
- **1.6 [Spam Filter](https://nuhmanpk.github.io/explore-machine-learning/demos/sup-spam.html)** — Teach a robot to spot spam. Mark messages as spam or fine and watch it learn which words are suspicious.
- **1.7 [Right or Wrong?](https://nuhmanpk.github.io/explore-machine-learning/demos/sup-metrics.html)** — A robot that is 99% accurate can still be useless. Meet false alarms and misses, and see why one number is never the whole story.

### Chapter 2 · [Finding Groups](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=unsup)

_Unsupervised learning: spotting patterns with no answers given._

- **2.1 [Pizza Shop Planner](https://nuhmanpk.github.io/explore-machine-learning/demos/unsup-kmeans.html)** — Where should the pizza shops go so every house gets pizza fast? Watch k-means move the shops step by step.
- **2.2 [Movie Recommender](https://nuhmanpk.github.io/explore-machine-learning/demos/unsup-recommend.html)** — People like you also liked... Rate a few movies and watch the model find your taste twins and suggest what to watch next.

### Chapter 3 · [Neural Networks](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=nn)

_Pretend brains made of tiny number-switches._

- **3.1 [Meet One Neuron](https://nuhmanpk.github.io/explore-machine-learning/demos/nn-neuron.html)** — One tiny brain cell decides: go outside or stay in? Wiggle its knobs, then watch it learn from example days.
- **3.2 [Brain Painter](https://nuhmanpk.github.io/explore-machine-learning/demos/nn-playground.html)** — Put red and blue dots anywhere. A little brain learns to paint the map so every dot sits on its own colour.
- **3.3 [Self-Driving Car](https://nuhmanpk.github.io/explore-machine-learning/demos/nn-car.html)** — Hundreds of baby cars learn to drive through traffic, round after round. Or drive yourself and let a car copy you!
- **3.4 [Learning Rate Race](https://nuhmanpk.github.io/explore-machine-learning/demos/nn-lr.html)** — A ball rolls downhill to find the lowest spot. Too slow, too wild, or just right? Race different step sizes and add momentum.
- **3.5 [Backprop, Step by Step](https://nuhmanpk.github.io/explore-machine-learning/demos/nn-backprop.html)** — Follow one tiny network as it guesses, sees how wrong it was, and sends the blame backwards to fix each weight.
- **3.6 [Why Brains Need a Bend](https://nuhmanpk.github.io/explore-machine-learning/demos/nn-activation.html)** — A network with no bend can only draw straight lines. Switch on a bend and watch it paint curvy shapes.

### Chapter 4 · [Reinforcement Learning](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=rl)

_Learning by trying, with rewards and oopsies._

- **4.1 [Mouse Finds Cheese](https://nuhmanpk.github.io/explore-machine-learning/demos/rl-maze.html)** — A little mouse explores a maze. Cheese is yummy, traps are ouchy. Watch it build a map of good moves.
- **4.2 [Balance the Pole](https://nuhmanpk.github.io/explore-machine-learning/demos/rl-balance.html)** — Keep a wobbly pole standing on a cart. Try it yourself, then watch Robo go from flop to pro.
- **4.3 [Bird Learns to Fly](https://nuhmanpk.github.io/explore-machine-learning/demos/rl-flappy.html)** — Tap to flap through the pipes. Then watch Robo crash, crash, crash… and then fly forever.
- **4.4 [Snake Learns to Eat](https://nuhmanpk.github.io/explore-machine-learning/demos/rl-snake.html)** — A hungry snake learns to chase food and not bite its own tail, one game at a time.
- **4.5 [Lucky Slot Machines](https://nuhmanpk.github.io/explore-machine-learning/demos/rl-bandit.html)** — Which slot machine pays best? Keep pulling the one you like, or try a new one? Watch Robo balance exploring and cashing in.
- **4.6 [Reward Hacking](https://nuhmanpk.github.io/explore-machine-learning/demos/rl-hack.html)** — Tell a robot what to win and it may find a silly shortcut. Write the reward, watch it cheat, then fix the rule.

### Chapter 5 · [Computer Vision](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=vision)

_Teaching computers to see._

- **5.1 [Robot Eyes](https://nuhmanpk.github.io/explore-machine-learning/demos/vision-pixels.html)** — Zoom in until a picture becomes numbers. Then try the magic glasses (filters) robots use to find edges.
- **5.2 [Teach the Camera](https://nuhmanpk.github.io/explore-machine-learning/demos/vision-teach.html)** — Show your camera a few things. It learns to tell them apart in seconds, and gets surer with every example.
- **5.3 [What Is It?](https://nuhmanpk.github.io/explore-machine-learning/demos/vision-guess.html)** — Point your camera at stuff or draw something. A brain trained on a million pictures tells you what it sees, and where it looked.
- **5.4 [Pattern Scanners](https://nuhmanpk.github.io/explore-machine-learning/demos/vision-scan.html)** — A tiny window slides over a picture looking for a pattern. Watch a robot learn its own scanner, the idea behind CNNs, to spot stripes and corners.
- **5.5 [Draw the Box](https://nuhmanpk.github.io/explore-machine-learning/demos/vision-detect.html)** — Find things in a picture and draw a box around each one. Watch a model learn where objects are, not just what they are.

### Chapter 6 · [Language Models & LLMs](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=lang)

_Guessing the next word, really, really well._

- **6.1 [Word Chopper](https://nuhmanpk.github.io/explore-machine-learning/demos/lang-tokens.html)** — Computers chop sentences into little pieces called tokens and turn each one into a number. Type and see!
- **6.2 [Robo Follows Instructions](https://nuhmanpk.github.io/explore-machine-learning/demos/lang-follow.html)** — Give Robo word-blocks like "go to the blue star". Watch it learn which words to pay attention to, until it obeys every time.
- **6.3 [Puppy Trainer (RLHF)](https://nuhmanpk.github.io/explore-machine-learning/demos/lang-rlhf.html)** — Pick which puppy trick earns a treat. A treat predictor learns your taste, then the puppy practises until it does what you love.
- **6.4 [Word Map](https://nuhmanpk.github.io/explore-machine-learning/demos/lang-embed.html)** — Words become points on a map where friends sit close together. Watch a model learn the map, then try word maths: king minus man plus woman.
- **6.5 [Where to Look](https://nuhmanpk.github.io/explore-machine-learning/demos/lang-attend.html)** — When a model reads a sentence, which words does it look at? Watch attention light up the words that matter, and the model learn where to look.

### Chapter 7 · [Vision-Language Models](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=vlm)

_Models that can see pictures and talk about them._

- **7.1 [Words ↔ Pictures](https://nuhmanpk.github.io/explore-machine-learning/demos/vlm-match.html)** — Draw or show a picture and type some words. Watch a real model turn both into numbers and find the best match.
- **7.2 [Picture Talker](https://nuhmanpk.github.io/explore-machine-learning/demos/vlm-caption.html)** — A model looks at your picture and writes what it sees, one word at a time.

### Chapter 8 · [Image Generation](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=diff)

_Diffusion models: making pictures by cleaning up static._

- **8.1 [Watch a Diffusion Model Learn](https://nuhmanpk.github.io/explore-machine-learning/demos/diff-train.html)** — Pick a shape. A little model practises un-fuzzing it, and you watch its drawings go from fog to a perfect shape.
- **8.2 [Fuzz & Un-Fuzz](https://nuhmanpk.github.io/explore-machine-learning/demos/diff-noise.html)** — Draw a little picture, fuzz it into static, then watch it get cleaned up frame by frame.
- **8.3 [Forger vs Detective](https://nuhmanpk.github.io/explore-machine-learning/demos/diff-gan.html)** — Two models compete: a forger makes fake pictures and a detective tries to catch them. Watch both get better.

### Chapter 9 · [Sound & Music](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=audio)

_Teaching computers to hear and to make music._

- **9.1 [Teach the Ear](https://nuhmanpk.github.io/explore-machine-learning/demos/audio-ear.html)** — See your voice as a picture, then teach the computer to tell claps, whistles and hums apart.
- **9.2 [Tune Finisher](https://nuhmanpk.github.io/explore-machine-learning/demos/audio-music.html)** — Play a few notes on the piano. Robo learns from tunes and finishes your song, note by note.

### Chapter 10 · [Video Generation](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=video)

_Making movies by predicting the next frame._

- **10.1 [Next-Frame Dreamer](https://nuhmanpk.github.io/explore-machine-learning/demos/video-next.html)** — A little model watches a bouncing ball and learns physics by itself. Then it dreams up its own videos.

### Chapter 11 · [Artificial Intelligence](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=ai)

_The bigger picture: machines that sense, think and act. Not all AI learns!_

- **11.1 [Robot Vacuum: Rules or Learning?](https://nuhmanpk.github.io/explore-machine-learning/demos/ai-agent.html)** — A robot vacuum senses, thinks and acts. Give it hand-written rules, or let it learn, and watch which one cleans better when the room changes.
- **11.2 [Pathfinder](https://nuhmanpk.github.io/explore-machine-learning/demos/ai-pathfinder.html)** — How does a map app find the best route? Watch smart search (A*) explore a map next to blind search, and see how many fewer steps it needs.
- **11.3 [The Thinking-Ahead Game](https://nuhmanpk.github.io/explore-machine-learning/demos/ai-minimax.html)** — Play tic-tac-toe against an AI that imagines every possible future. See its thinking tree, and try (and fail) to beat it.
- **11.4 [Chess vs the AI](https://nuhmanpk.github.io/explore-machine-learning/demos/ai-chess.html)** — Play real chess against an AI that imagines moves and replies. Change how far ahead it looks and see the moves it considered.
- **11.5 [Mind Reader](https://nuhmanpk.github.io/explore-machine-learning/demos/ai-twenty.html)** — Think of an animal. An AI asks yes/no questions and guesses it. See how it picks the best question, and why asking the right one matters.
- **11.6 [Where AI Fails](https://nuhmanpk.github.io/explore-machine-learning/demos/ai-fails.html)** — AI can be confidently wrong. Spot the mistakes, see why they happen, and learn when not to trust it.
- **11.7 [Your Data, Your Privacy](https://nuhmanpk.github.io/explore-machine-learning/demos/ai-privacy.html)** — A model can remember things it was taught. See how secrets can leak out of training data and how to protect them.

### Chapter 12 · [Data & Features](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=data)

_Before a model can learn, the data has to be fit to learn from._

- **12.1 [Tidy the Mess](https://nuhmanpk.github.io/explore-machine-learning/demos/data-clean.html)** — A dog table full of blanks, typos and silly numbers. Clean it up and watch the robot's score shoot up.
- **12.2 [Same Size, Fair Fight](https://nuhmanpk.github.io/explore-machine-learning/demos/data-scale.html)** — Age goes to 80 but income goes to 200,000. See the robot ignore age, then make the sizes fair.
- **12.3 [Pick the Clues](https://nuhmanpk.github.io/explore-machine-learning/demos/data-features.html)** — A puzzle no straight line can solve becomes easy with the right clue. Pick clues and beware of junk.
- **12.4 [Who Did You Ask?](https://nuhmanpk.github.io/explore-machine-learning/demos/data-sampling.html)** — Ask only one neighbourhood and the robot fails everywhere else. Fix it by asking a varied crowd.

### Chapter 13 · [Time Series & Forecasting](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=time)

_Numbers that change over time, and how to guess what comes next._

- **13.1 [Smooth the Wiggles](https://nuhmanpk.github.io/explore-machine-learning/demos/time-trend.html)** — Ice-cream sales bounce around. Average a few days and the real trend appears, but average too many and you arrive late.
- **13.2 [Spot the Seasons](https://nuhmanpk.github.io/explore-machine-learning/demos/time-season.html)** — Find how long a pattern takes to repeat and watch the robot split sales into trend, season and noise.
- **13.3 [Predict Tomorrow](https://nuhmanpk.github.io/explore-machine-learning/demos/time-forecast.html)** — Teach a robot to forecast from the past and see how its guesses get worse the further ahead it looks.
- **13.4 [Spot the Odd One](https://nuhmanpk.github.io/explore-machine-learning/demos/time-anomaly.html)** — Set an alarm line on a sensor and feel the trade-off between false alarms and missed problems.

### Chapter 14 · [Agents & Tools](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=agents)

_AI that does not just answer: it plans, uses tools and remembers._

- **14.1 [Think, Act, Look](https://nuhmanpk.github.io/explore-machine-learning/demos/agent-loop.html)** — Watch a helper think, use a tool, and look at the result, again and again. Then break a tool and see if it copes.
- **14.2 [Pick the Right Tool](https://nuhmanpk.github.io/explore-machine-learning/demos/agent-tools.html)** — A helper has a calculator, a clock and a lookup table. Teach it which one each request needs.
- **14.3 [A Small Backpack](https://nuhmanpk.github.io/explore-machine-learning/demos/agent-memory.html)** — A chat helper can only hold so many words. Shrink its backpack and see which memory trick still remembers.
- **14.4 [Plan Before You Go](https://nuhmanpk.github.io/explore-machine-learning/demos/agent-plan.html)** — Grabbing the cheapest next step can lead to a dead end. Race a greedy robot against a planner, then break a step.

### Chapter 15 · [Ethics, Safety & Alignment](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=ethics)

_Making AI fair, understandable, honest and hard to trick._

- **15.1 [Is It Fair?](https://nuhmanpk.github.io/explore-machine-learning/demos/ethics-bias.html)** — A pretend club robot learned from unfair old decisions. Check how it treats two groups, then try to fix it.
- **15.2 [Why Did It Say That?](https://nuhmanpk.github.io/explore-machine-learning/demos/ethics-explain.html)** — Ask a cat-or-dog robot for its reasons, poke one clue at a time, and catch it using a silly shortcut.
- **15.3 [How Sure Is Sure?](https://nuhmanpk.github.io/explore-machine-learning/demos/ethics-calibrate.html)** — A robot says it is 95% sure. Is it really? Check its honesty, then teach it to say "I don't know".
- **15.4 [Tricked by Words](https://nuhmanpk.github.io/explore-machine-learning/demos/ethics-inject.html)** — A pretend assistant obeys orders hidden in an email. Try four defences against fake tricks (a safe simulation).

### Chapter 16 · [Ensembles & Boosting](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=ensemble)

_Many simple models, voting together, beat one clever model._

- **16.1 [Wisdom of the Crowd](https://nuhmanpk.github.io/explore-machine-learning/demos/ens-wisdom.html)** — Guess the jellybeans with a crowd. One guess is wobbly, but the average of many lands close. Unless everyone leans the same way!
- **16.2 [Vote of Many Trees](https://nuhmanpk.github.io/explore-machine-learning/demos/ens-bagging.html)** — Give lots of little decision trees a shuffled copy of the data and let them vote. The vote is calmer than any one tree.
- **16.3 [Learn from Mistakes](https://nuhmanpk.github.io/explore-machine-learning/demos/ens-boost.html)** — Tiny helpers make one cut each. Dots they get wrong grow bigger, so the next helper tries harder on them.
- **16.4 [Bagging vs Boosting](https://nuhmanpk.github.io/explore-machine-learning/demos/ens-compare.html)** — Same noisy dots, two team styles. Turn up the wrong labels and see which team keeps its cool.

### Chapter 17 · [Generative Models](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=gen)

_Squeezing pictures into a few numbers, and making new ones from them._

- **17.1 [Squeeze and Rebuild](https://nuhmanpk.github.io/explore-machine-learning/demos/gen-compress.html)** — Squeeze tiny pictures into a few numbers and watch a real neural network rebuild them. Tighter squeeze, blurrier picture.
- **17.2 [Map of Pictures](https://nuhmanpk.github.io/explore-machine-learning/demos/gen-latent.html)** — A network arranges pictures on a map. Click anywhere to see what it draws there, and slide from one picture to another.
- **17.3 [Make New Pictures](https://nuhmanpk.github.io/explore-machine-learning/demos/gen-vae.html)** — Pick random spots on the map and the network invents brand-new pictures. Too few rules gives junk, too many gives blur.
- **17.4 [Spot the Stranger](https://nuhmanpk.github.io/explore-machine-learning/demos/gen-odd.html)** — A network that only knows one kind of picture rebuilds strangers badly. Slide the alarm line and catch them.

### Chapter 18 · [Graphs, Ranking & Search](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=graphs)

_Things that are connected: friends, web pages and search results._

- **18.1 [Friends of Friends](https://nuhmanpk.github.io/explore-machine-learning/demos/graph-social.html)** — Dots are people and lines are friendships. Tap someone to see their friend group and who they might want to meet.
- **18.2 [The Random Surfer](https://nuhmanpk.github.io/explore-machine-learning/demos/graph-pagerank.html)** — A surfer clicks random links around a tiny web. The pages she visits most are the important ones. Add links and try a cheat!
- **18.3 [Search Engine](https://nuhmanpk.github.io/explore-machine-learning/demos/graph-search.html)** — Search thirty tiny pages and see exactly which words pushed each result up the list.
- **18.4 [Ask Your Neighbours](https://nuhmanpk.github.io/explore-machine-learning/demos/graph-gnn.html)** — Only a few dots have name tags. Can a robot guess the rest by asking who each dot is connected to?

### Chapter 19 · [Robotics & Control](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=robotics)

_How machines move, sense and find their way._

- **19.1 [Steady Hands (PID)](https://nuhmanpk.github.io/explore-machine-learning/demos/robo-pid.html)** — Tune three knobs, P, I and D, to keep a drone at the right height even when the wind blows.
- **19.2 [Reach with Maths](https://nuhmanpk.github.io/explore-machine-learning/demos/robo-arm.html)** — Drag a target and watch a robot arm work out its joint angles with triangle maths. Spot the two ways to reach!
- **19.3 [Trust Your Sensors](https://nuhmanpk.github.io/explore-machine-learning/demos/robo-sense.html)** — A jittery sensor and drifting wheels each get it wrong. A Kalman filter blends them into a much better guess.
- **19.4 [Find a Way Around](https://nuhmanpk.github.io/explore-machine-learning/demos/robo-plan.html)** — Draw walls and grow a random tree of tries until it finds a path. Then race it against careful A*.

### Chapter 20 · [Optimisation & Search](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=optim)

_Finding the best answer when there are too many to check._

- **20.1 [Evolve an Answer](https://nuhmanpk.github.io/explore-machine-learning/demos/opt-genetic.html)** — Breed a crowd of scribbles, over and over, until a hidden picture appears. Nobody draws it!
- **20.2 [Cool Down to Solve](https://nuhmanpk.github.io/explore-machine-learning/demos/opt-anneal.html)** — Plan a short trip through 20 towns. A hot robot makes mistakes on purpose, then cools down and beats the greedy one.
- **20.3 [Find the Best Knobs](https://nuhmanpk.github.io/explore-machine-learning/demos/opt-tune.html)** — A model has settings. Try them in a grid or at random, and learn why peeking at the final exam is cheating.
- **20.4 [Swarm of Searchers](https://nuhmanpk.github.io/explore-machine-learning/demos/opt-swarm.html)** — A flock hunts for the highest hill. Tune how stubborn and how social they are, and watch them find it or get trapped.

### Chapter 21 · [Probability & Uncertainty](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=prob)

_Being sensible about chance: beliefs, averages and what happens next._

- **21.1 [Update Your Belief](https://nuhmanpk.github.io/explore-machine-learning/demos/prob-bayes.html)** — A test says positive. Count 1000 dots to see how often that is a false alarm, then test again and watch your belief move.
- **21.2 [Throw Darts to Find Pi](https://nuhmanpk.github.io/explore-machine-learning/demos/prob-monte.html)** — Throw random darts to discover pi, then beat the Monty Hall door puzzle by playing it 10,000 times.
- **21.3 [Averages Get Bell-Shaped](https://nuhmanpk.github.io/explore-machine-learning/demos/prob-clt.html)** — Average numbers from a lumpy, lopsided source and watch a smooth bell curve appear. Then build a confidence interval.
- **21.4 [Next State Please](https://nuhmanpk.github.io/explore-machine-learning/demos/prob-markov.html)** — A weather walker only remembers today. Edit its chances, see where it settles, then write sentences with a tiny next-word chain.

### Chapter 22 · [Game Lab](https://nuhmanpk.github.io/explore-machine-learning/topic.html?t=games)

_Games where the computer learns, gets better, and adapts when you make it harder._

- **22.1 [Boat Crosses the River](https://nuhmanpk.github.io/explore-machine-learning/demos/game-boat.html)** — Little boats learn to fight the river current and reach the dock. Then make the current stronger, add logs or a whirlpool!
- **22.2 [Basketball Shooter](https://nuhmanpk.github.io/explore-machine-learning/demos/game-hoops.html)** — Robo throws, misses, and adjusts its aim until it sinks every shot. Then add wind or move the hoop!
- **22.3 [Sailboat Beats the Wind](https://nuhmanpk.github.io/explore-machine-learning/demos/game-sail.html)** — A sailboat can't sail straight into the wind. Watch it learn to zig-zag to the buoy, then shift the wind on it.
- **22.4 [Goalie vs You](https://nuhmanpk.github.io/explore-machine-learning/demos/game-goalie.html)** — Take penalty kicks. The goalie learns your habits and starts saving them. Can you trick it?
- **22.5 [Rocket Lander](https://nuhmanpk.github.io/explore-machine-learning/demos/game-rocket.html)** — Try landing a rocket gently. Then watch Robo learn it, even with wind, heavy gravity and a moving landing pad.
- **22.6 [Creature Learns to Walk](https://nuhmanpk.github.io/explore-machine-learning/demos/game-walker.html)** — Wobbly creatures made of sticks and muscles learn to walk. Add hills, ice or a heavy backpack!
- **22.7 [Dino Runner](https://nuhmanpk.github.io/explore-machine-learning/demos/game-dino.html)** — A herd of baby dinos learns when to jump and when to duck. Speed it up or turn the lights off!
- **22.8 [Space Dodger](https://nuhmanpk.github.io/explore-machine-learning/demos/game-space.html)** — Little spaceships use radar to dodge asteroids and grab stars. Then start a meteor shower!
- **22.9 [Robo Arm](https://nuhmanpk.github.io/explore-machine-learning/demos/game-arm.html)** — Robot arms with muscles learn to pick up a cube at A and drop it on a pad at B. Watch the muscles bulge, then make the cube heavy or the muscles tired!
- **22.10 [Delivery Drone](https://nuhmanpk.github.io/explore-machine-learning/demos/game-drone.html)** — Like the drones that deliver medicine and parcels today. Little drones learn to hover, fly to a house and drop the package. Then add wind or a heavier box!
- **22.11 [Ants Find the Best Path](https://nuhmanpk.github.io/explore-machine-learning/demos/game-ants.html)** — Hundreds of ants leave smelly trails and find the shortest way to food. Block their path and watch them find a new one.
- **22.12 [Auto-Parking](https://nuhmanpk.github.io/explore-machine-learning/demos/game-parking.html)** — Little cars with distance sensors learn to steer into a bay and stop inside the lines. Then add parked neighbours, posts or a tight bay!
- **22.13 [Lane Keeper](https://nuhmanpk.github.io/explore-machine-learning/demos/game-lane.html)** — Little cars learn to follow a winding road and stay in their lane. Then add hairpin bends, rain or cones in the road!


## Run it locally

There is **no build step and no dependencies.** It is plain HTML, CSS and JavaScript.

```bash
git clone https://github.com/nuhmanpk/explore-machine-learning.git
cd explore-machine-learning

# any static file server works
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

To see the custom **404 page** locally, use the included `serve.py` instead (it behaves like GitHub Pages):

```bash
python3 serve.py 8000
```

> VS Code Live Server and `python3 -m http.server` show their own plain "Cannot GET" page, so they never show `404.html`. GitHub Pages does.

> Opening `index.html` straight from disk works for most lessons, but serve it over `http://` for the ones that download pretrained models (Transformers.js and TensorFlow.js need it).

### Deploy it

It is a static site, so any static host works. For GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root.**

## Pretrained models

Most lessons train their own tiny models live in your browser, so nothing is downloaded. A few use real pretrained models and ask before downloading:

| Lessons | Downloads (only after you press the button) |
|---|---|
| Teach the Camera, What Is It? | TensorFlow.js + MobileNet, about 15 MB |
| Word Chopper | GPT-2 tokenizer via Transformers.js |
| Words ↔ Pictures | CLIP via Transformers.js (about 150 MB) |
| Picture Talker | ViT-GPT2 captioning via Transformers.js (about 250 MB) |

## Project structure

```text
index.html          Home page: the course map
topic.html          Chapter page: explainer + words to know + lesson list
css/style.css       Shared design system (light/dark themes, game layout, X-ray)
js/catalog.js       The whole syllabus + the "Meet the model" text for each lesson
js/common.js        Page chrome: top bar, icons, mascot, lesson path, footer
js/xray.js          The shared Model X-ray
demos/<id>.html     One page per lesson
demos/js/<id>.js    The lesson's UI and drawing
demos/js/<id>-core.js   The model and simulation (also runs in Node for testing)
```

**Adding a lesson:** add an entry to `js/catalog.js` (and a `MODELS` entry for its "Meet the model" card), then create `demos/<id>.html` and `demos/js/<id>.js`. The home page, chapter page, breadcrumbs, lesson numbers and next/previous links are all built from the catalog.

## Tech

- Plain **HTML, CSS and JavaScript**. No framework, no bundler.
- **Canvas** for the simulations; inline **SVG** icons.
- **Plain-JS** implementations of Q-learning, neuroevolution, backpropagation, k-means, decision trees and random forests, ant colony optimisation, DDPM-style diffusion and more. Most simulation cores also run in Node, which is how the difficulty of each game was tuned.
- **[TensorFlow.js](https://www.tensorflow.org/js)** and **[Transformers.js](https://huggingface.co/docs/transformers.js)** for the few lessons that use real pretrained models.

## Inspiration and credits

- **Radu Mariescu-Istodor**'s freeCodeCamp course [*Self-driving car with JavaScript*](https://www.youtube.com/watch?v=Rs_rAxEsAvI) inspired the car lesson.
- The interactive explainers from the **[Polo Club of Data Science](https://github.com/poloclub)** (CNN Explainer, Diffusion Explainer, Transformer Explainer) inspired the idea of learning by touching a model. This course tries to be a gentler, more playful cousin.
- **Karl Sims**' *Evolved Virtual Creatures* (1994) and **Keiwan**'s *Evolution* inspired the creature walker and the muscle-driven Robo Arm.

## Contributing

Ideas, bug reports and new lessons are welcome. Open an issue or a pull request. A good lesson lets people **see the model get better**, lets them **break it** with a challenge, and explains it so a child could follow.

## Connect

Built by **Nuhman PK**.

<p>
  <a href="https://github.com/nuhmanpk"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-nuhmanpk-181717?style=for-the-badge&logo=github"></a>
  <a href="https://www.kaggle.com/nuhmanpk"><img alt="Kaggle" src="https://img.shields.io/badge/Kaggle-nuhmanpk-20BEFF?style=for-the-badge&logo=kaggle&logoColor=white"></a>
  <a href="https://huggingface.co/nuhmanpk"><img alt="Hugging Face" src="https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-nuhmanpk-FFD21E?style=for-the-badge"></a>
  <a href="https://www.buymeacoffee.com/nuhmanpk"><img alt="Buy me GPU credits" src="https://img.shields.io/badge/Buy%20me-GPU%20credits-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black"></a>
</p>

If this helped you, a star on the repo goes a long way, and GPU credits help me build more.

## License

[Apache License](http://www.apache.org/licenses/)

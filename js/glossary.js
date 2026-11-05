/* Explore ML glossary: every word the course teaches, in kid words and grown-up words.
   window.GLOSSARY = [{ id, term, aliases, kid, grown, lessons, see }] sorted by term.
   Used by glossary.html and by the word helpers in js/common.js. Works in Node too. */
(function () {
  const L = [];
  // e(id, term, aliases, kid, grown, lessons, see)
  const e = (id, term, aliases, kid, grown, lessons, see) => L.push({ id, term, aliases, kid, grown, lessons, see });

  e("a-star", "A* search", ["a*", "a-star", "a star"],
    "A clever way to find the shortest route. It always tries the step that looks closest to the goal while remembering how far it has already walked.",
    "Best-first graph search ordering nodes by f(n) = g(n) + h(n), cost so far plus a heuristic estimate to the goal. With an admissible heuristic (never overestimates) it returns an optimal path.",
    ["ai-pathfinder", "robo-plan", "game-parking"], ["heuristic", "search", "path-planning"]);
  e("accuracy", "Accuracy", ["accurate"],
    "How many answers the computer got right out of all its tries. 9 right out of 10 is 90% accuracy.",
    "The fraction of predictions that are correct: (TP + TN) / total. Misleading on imbalanced data, where always guessing the common class scores highly (the accuracy paradox).",
    ["sup-metrics", "sup-traintest", "sup-spam"], ["precision", "recall", "confusion-matrix"]);
  e("action", "Action", ["actions"],
    "Something an agent can choose to do, like move left, jump or flap.",
    "An element of the action space A available to an agent in a state; the policy maps states to (distributions over) actions.",
    ["rl-maze", "rl-flappy", "game-lane"], ["agent", "policy", "state"]);
  e("activation-function", "Activation function", ["activation", "activations", "relu", "sigmoid", "tanh"],
    "A little rule inside each neuron that decides how loudly it shouts its answer. Without it, a network can only draw straight lines.",
    "A non-linear function applied to a neuron's weighted sum, such as ReLU max(0, x), sigmoid 1/(1+e^-x) or tanh. Non-linearity lets stacked layers represent curved decision boundaries.",
    ["nn-activation", "nn-playground"], ["neuron", "decision-boundary", "layer"]);
  e("adam", "Adam optimiser", ["adam", "optimiser", "optimizer"],
    "A smart way of taking learning steps that speeds up on smooth slopes and slows down on bumpy ones.",
    "Adaptive Moment Estimation: gradient descent with per-parameter step sizes from running averages of the gradient (momentum) and its square. The default optimiser for most deep learning.",
    ["nn-lr"], ["gradient-descent", "learning-rate"]);
  e("agent", "Agent", ["agents", "ai agent", "intelligent agent"],
    "Anything that looks at the world, decides what to do and then does it, like a robot, a game character or a chatbot using tools.",
    "A system that perceives its environment and selects actions to achieve goals. In RL it learns a policy from reward; LLM agents loop think, act (call a tool), observe.",
    ["ai-agent", "rl-maze", "agent-loop", "game-herd", "game-bees"], ["environment", "reward", "tool-use"]);
  e("agent-loop", "Agent loop", ["think-act-observe", "react loop", "react"],
    "The loop a helper AI repeats: think about what to do, do one thing, look at what happened, then think again until the job is done.",
    "The ReAct-style cycle of reasoning, tool call and observation that an LLM agent runs, usually with a max-turns limit and error handling so it cannot loop forever.",
    ["agent-loop", "agent-tools", "agent-plan"], ["agent", "tool-use", "planning"]);
  e("alignment", "Alignment", ["aligned", "ai safety", "ai-safety"],
    "Making sure an AI really wants what people want, not just something that looks like it from the outside.",
    "The problem of ensuring AI systems pursue their designers' intended goals and values. Failures include reward hacking, specification gaming and deceptive behaviour.",
    ["lang-rlhf", "rl-hack", "ethics-inject"], ["rlhf", "reward-hacking", "goodharts-law"]);
  e("alpha-beta", "Alpha-beta pruning", ["alpha-beta", "pruning"],
    "A shortcut for game-playing computers: stop thinking about a move as soon as you know it is worse than one you already found.",
    "An optimisation of minimax that skips branches which cannot affect the final decision, keeping bounds α (best for max) and β (best for min). Same answer, far fewer nodes.",
    ["ai-minimax", "ai-chess"], ["minimax", "search"]);
  e("anomaly", "Anomaly", ["anomalies", "anomaly detection", "outlier detection"],
    "Something weird that does not fit the usual pattern, like a heartbeat that suddenly jumps.",
    "An observation that deviates strongly from expected behaviour. Detected with thresholds on residuals (for example a z-score from a rolling mean), density methods or reconstruction error.",
    ["time-anomaly", "gen-odd", "unsup-dbscan"], ["outlier", "reconstruction-error", "z-score"]);
  e("ant-colony", "Ant colony optimisation", ["ant colony", "pheromone", "pheromones", "aco"],
    "Ants leave a smelly trail. Short paths get walked more, so they smell stronger, so more ants choose them. Teamwork finds the best route.",
    "A swarm metaheuristic where artificial ants build solutions probabilistically, biased by pheromone that is reinforced on good paths and evaporates over time.",
    ["game-ants", "opt-swarm"], ["swarm-intelligence", "emergence"]);
  e("attention", "Attention", ["self-attention", "attend", "attention head", "multi-head"],
    "When reading a word, the model looks back at the other words that matter most, like knowing \"it\" means the cat.",
    "A mechanism computing a weighted sum of value vectors, with weights softmax(QK^T / sqrt(d)) from query-key similarity. Self-attention with many heads is the core of the transformer.",
    ["lang-attend", "vlm-ask"], ["transformer", "query-key-value", "token"]);
  e("autoencoder", "Autoencoder", ["autoencoders", "encoder", "decoder"],
    "A network that squishes a picture into a few numbers and then tries to rebuild it. To do that well it has to learn what matters.",
    "A network trained to reconstruct its input through a narrow bottleneck: an encoder maps x to a latent code z and a decoder maps z back to x̂, minimising reconstruction error.",
    ["gen-compress", "gen-latent", "gen-odd"], ["latent-space", "vae", "reconstruction-error"]);
  e("autoregressive", "Autoregressive model", ["autoregressive", "autoregression", "ar model"],
    "A model that makes the next bit from the bits it already made, one after another, like writing a story word by word.",
    "A model of p(x_t | x_<t): each output is predicted from previous outputs and fed back in. Used by LLMs, AR time-series models and next-frame video predictors.",
    ["lang-follow", "video-next", "time-forecast"], ["next-token", "rollout", "forecast"]);
  e("backpropagation", "Backpropagation", ["backprop", "back-propagation"],
    "After a wrong answer, the network passes the blame backwards, layer by layer, so every weight knows how to change a little.",
    "An algorithm that computes the gradient of the loss with respect to every weight by applying the chain rule backwards through the network, reusing intermediate results.",
    ["nn-backprop", "nn-playground"], ["gradient-descent", "weight", "loss-function"]);
  e("bagging", "Bagging", ["bootstrap aggregating", "bootstrap", "bootstrap sample"],
    "Make lots of models, each taught from a slightly different random pile of examples, then let them vote.",
    "Bootstrap aggregating: train models on bootstrap resamples (sampling with replacement) and average or vote. Reduces variance; samples left out give an out-of-bag error estimate.",
    ["ens-bagging", "sup-forest", "ens-compare"], ["ensemble", "random-forest", "variance"]);
  e("bandit", "Multi-armed bandit", ["bandit", "bandits", "slot machine"],
    "A row of prize machines. Which one pays best? You have to try some to find out, but every try costs a coin.",
    "A one-state RL problem: choose among K arms with unknown reward distributions to maximise total reward. Solved with ε-greedy, UCB or Thompson sampling.",
    ["rl-bandit"], ["exploration", "epsilon-greedy", "reward"]);
  e("bayes-rule", "Bayes' rule", ["bayes", "bayes rule", "bayes' theorem", "bayesian", "posterior"],
    "A way to update what you believe when you get a new clue: start with a guess, then make it stronger or weaker.",
    "P(H | E) = P(E | H) P(H) / P(E): the posterior is the likelihood times the prior, normalised. Ignoring the prior gives base-rate neglect.",
    ["prob-bayes", "sup-spam", "robo-sense"], ["prior", "likelihood", "naive-bayes"]);
  e("behaviour-cloning", "Behaviour cloning", ["imitation learning", "behavior cloning"],
    "Learning to do something by copying what an expert does, like learning to drive by watching a good driver.",
    "Supervised learning of a policy from expert state-action pairs. Simple but suffers from compounding errors when the learner drifts into states the expert never visited.",
    ["nn-car", "game-lane"], ["policy", "supervised-learning"]);
  e("bias", "Bias (unfairness)", ["unfair", "unfairness", "biased", "fairness"],
    "When an AI treats some people or things unfairly, often because the examples it learned from were lopsided.",
    "Systematic error that disadvantages groups, arising from skewed sampling, label bias, proxy variables or feedback loops. Measured with metrics such as demographic parity or equal opportunity gaps.",
    ["ai-fails", "ethics-bias", "data-sampling"], ["sampling", "proxy-variable", "explainability"]);
  e("bias-term", "Bias (in a neuron)", ["bias term", "intercept", "offset"],
    "An extra number a neuron adds on, like a head start, so it can say yes even when its inputs are small.",
    "The constant b in y = w·x + b. It shifts the decision boundary away from the origin and is learned like any weight.",
    ["nn-neuron", "sup-line"], ["neuron", "weight"]);
  e("bias-variance", "Bias-variance trade-off", ["bias-variance", "underfitting", "underfit"],
    "Too simple a model misses the pattern; too wiggly a model copies the noise. The sweet spot is in the middle.",
    "Expected test error decomposes into bias squared, variance and irreducible noise. Simple models have high bias (underfit); flexible models have high variance (overfit).",
    ["sup-overfit", "ens-compare"], ["overfitting", "variance", "regularisation"]);
  e("boids", "Boids", ["flocking", "flock"],
    "Pretend birds that follow three tiny rules: do not crash, go the same way as friends, stay close. Together they make a beautiful flock.",
    "Reynolds' 1986 flocking model where each agent steers by separation, alignment and cohesion with its neighbours. Complex group motion emerges from local rules.",
    ["game-fish", "game-herd", "opt-swarm"], ["emergence", "swarm-intelligence"]);
  e("boosting", "Boosting", ["adaboost", "boost"],
    "A team of small, weak models where each new one practises the examples the others got wrong.",
    "Sequentially fitting weak learners (often decision stumps) to the errors of the ensemble so far, by reweighting examples (AdaBoost) or fitting residuals (gradient boosting). Mainly reduces bias.",
    ["ens-boost", "ens-compare", "ens-gbm"], ["ensemble", "bagging", "gradient-boosting"]);
  e("bounding-box", "Bounding box", ["bounding boxes", "box", "iou", "intersection over union"],
    "A rectangle drawn around a thing in a picture to say \"the cat is here\".",
    "An axis-aligned rectangle (x, y, w, h) localising an object. Overlap with the truth is scored by IoU, area of intersection over area of union.",
    ["vision-detect"], ["object-detection", "non-max-suppression"]);
  e("calibration", "Calibration", ["calibrated", "overconfident", "overconfidence", "confidence"],
    "When a model says \"I am 80% sure\", it should be right about 8 times out of 10. That honesty is called calibration.",
    "Agreement between predicted probabilities and observed frequencies, shown on a reliability diagram and measured by expected calibration error. Fixed with Platt or temperature scaling.",
    ["ethics-calibrate", "sup-metrics"], ["probability", "temperature"]);
  e("caption", "Caption", ["captions", "captioning", "image captioning"],
    "A sentence that says what is in a picture, like \"a dog catching a ball\".",
    "Image captioning generates text conditioned on an image, usually with a vision encoder feeding a language decoder through cross-attention.",
    ["vlm-caption", "vlm-ask"], ["vlm", "embedding"]);
  e("central-limit-theorem", "Central limit theorem", ["clt", "bell curve", "normal distribution", "gaussian"],
    "Add up lots of random things and the totals pile up into a bell shape, almost every time.",
    "The mean of n independent, identically distributed samples with finite variance tends to a normal distribution, with spread shrinking like σ/sqrt(n).",
    ["prob-clt", "prob-monte"], ["probability", "monte-carlo"]);
  e("centroid", "Centre (centroid)", ["centroid", "centroids", "centre", "center", "cluster centre"],
    "The middle spot of a group. In k-means, each group has a centre that moves to the average of its members.",
    "The mean of the points assigned to a cluster. K-means alternates assigning points to the nearest centroid and recomputing centroids.",
    ["unsup-kmeans"], ["k-means", "cluster"]);
  e("challenge", "Challenge", ["challenges", "level"],
    "A harder job you set for a learning game to see if the AI can cope, like more wind or a smaller goal.",
    "In the Game Lab, a change to the environment that tests generalisation: does the learned policy still work when conditions shift?",
    ["game-boat", "game-sail", "game-rocket", "game-glider"], ["generalisation", "distribution-shift"]);
  e("chain-of-thought", "Chain of thought", ["reasoning", "think step by step"],
    "Asking a model to write out its thinking step by step, which often helps it get trickier questions right.",
    "Prompting or training a language model to produce intermediate reasoning tokens before the answer, which improves multi-step problem solving.",
    ["agent-plan", "lang-follow"], ["planning", "prompt"]);
  e("classifier", "Classifier", ["classification", "classify", "class", "classes"],
    "A model that sorts things into groups, like cat or dog, spam or not spam.",
    "A function mapping inputs to a discrete set of labels, often via predicted class probabilities and an argmax or threshold.",
    ["sup-fruit", "sup-spam", "audio-ear", "vision-teach"], ["label", "decision-boundary", "logistic-regression"]);
  e("clip", "CLIP", ["contrastive", "contrastive learning"],
    "A model that learned from millions of pictures with their captions, so it can tell which words match which picture.",
    "Contrastive Language-Image Pre-training (OpenAI, 2021): image and text encoders trained so matching pairs have high cosine similarity in a shared embedding space. Enables zero-shot classification.",
    ["vlm-match", "diff-guide"], ["embedding", "cosine-similarity", "vlm"]);
  e("cluster", "Cluster", ["clusters", "clustering", "group"],
    "A bunch of things that are close together and alike, found without anyone telling the computer the answer.",
    "A group of points more similar to each other than to points in other groups. Found by algorithms such as k-means, DBSCAN or hierarchical clustering.",
    ["unsup-kmeans", "unsup-dbscan", "graph-social"], ["k-means", "dbscan", "unsupervised-learning"]);
  e("cnn", "CNN (convolutional neural network)", ["cnn", "cnns", "convnet", "convolutional"],
    "A picture-reading network that slides little pattern-finders over the image, first spotting edges, then shapes, then whole things.",
    "A neural network built from convolutional layers with shared weights, plus pooling and non-linearities, giving translation-tolerant feature hierarchies. Examples: LeNet, ResNet, MobileNet.",
    ["vision-scan", "vision-teach", "vision-guess"], ["convolution", "filter", "pooling"]);
  e("collaborative-filtering", "Collaborative filtering", ["recommendation", "recommender", "recommendations"],
    "\"People who liked what you liked also liked this.\" That is how apps suggest films and songs.",
    "Recommending items from the user-item rating matrix alone, via user-user or item-item similarity or matrix factorisation into latent factors.",
    ["unsup-recommend"], ["cosine-similarity", "embedding"]);
  e("confusion-matrix", "Confusion matrix", ["true positive", "false positive", "false negative", "true negative"],
    "A little table showing which answers the model got right and which ones it mixed up.",
    "A table of counts of predicted versus actual classes; for two classes, TP, FP, FN and TN, from which accuracy, precision and recall are computed.",
    ["sup-metrics", "sup-spam"], ["precision", "recall", "accuracy"]);
  e("context-window", "Context window", ["context", "context length"],
    "How much a language model can keep in mind at once. Anything older falls out, like a short memory.",
    "The maximum number of tokens a model attends to in one forward pass. Content beyond it must be summarised, retrieved or dropped.",
    ["agent-memory", "lang-attend"], ["token", "memory", "retrieval"]);
  e("convolution", "Convolution", ["convolve", "kernel", "convolution kernel"],
    "Sliding a tiny grid of numbers across a picture and multiplying, to make a new picture that highlights edges or blur.",
    "An operation computing a weighted sum of a local neighbourhood at every position using a shared kernel; deep learning layers actually compute cross-correlation.",
    ["vision-scan", "vision-pixels"], ["filter", "cnn", "feature-map"]);
  e("cosine-similarity", "Cosine similarity", ["cosine", "similarity"],
    "A way to measure if two arrows point the same way. Same way means very alike; opposite means not alike at all.",
    "cos θ = a·b / (|a||b|), from -1 to 1. Standard for comparing embeddings because it ignores vector length.",
    ["lang-embed", "vlm-match", "unsup-recommend"], ["embedding", "clip"]);
  e("cross-validation", "Cross-validation", ["k-fold", "k-fold cross-validation", "cross validation"],
    "Taking turns: hide a different slice of the examples each time, test on it, and average the scores. Fairer than one test.",
    "k-fold cross-validation splits data into k folds, trains on k-1 and tests on the remaining fold k times, averaging the scores. Used for model selection and hyperparameter tuning.",
    ["sup-traintest", "opt-tune"], ["test-set", "hyperparameter"]);
  e("crossover", "Crossover", ["recombination", "breeding"],
    "Mixing two good parents to make a child that has a bit of each, like in a genetic algorithm.",
    "A genetic operator that combines parts of two parent genomes (one-point, uniform, or order crossover) to produce offspring.",
    ["opt-genetic", "game-walker", "game-rocket"], ["genetic-algorithm", "mutation", "generation"]);
  e("curse-of-dimensionality", "Curse of dimensionality", ["high-dimensional", "dimensions"],
    "With lots and lots of features, everything ends up far from everything else, so finding neighbours gets hard.",
    "Phenomena in high dimensions: volume grows exponentially, distances concentrate and data becomes sparse, hurting distance-based methods.",
    ["unsup-pca", "data-features"], ["pca", "feature", "k-nearest-neighbours"]);
  e("data", "Data", ["dataset", "datasets", "examples"],
    "The examples a computer learns from: pictures, numbers, sounds or words.",
    "The observations used to train and evaluate a model, typically split into training, validation and test sets. Quality and coverage matter as much as quantity.",
    ["intro-ml", "data-clean", "data-sampling"], ["training", "feature", "label"]);
  e("data-augmentation", "Data augmentation", ["augmentation", "augment"],
    "Making extra practice examples by flipping, turning or tinting the ones you have.",
    "Expanding a training set with label-preserving transformations (crops, flips, noise, colour jitter) to improve generalisation and robustness.",
    ["vision-teach", "sup-overfit"], ["overfitting", "regularisation"]);
  e("data-leakage", "Data leakage", ["leakage", "leak"],
    "When the answer sneaks into the practice questions, so the model looks clever but is really cheating.",
    "When information unavailable at prediction time (test labels, future values, target-derived features) leaks into training, inflating evaluation scores.",
    ["sup-traintest", "data-features"], ["test-set", "cross-validation"]);
  e("dbscan", "DBSCAN", ["density clustering", "core point", "border point", "noise point"],
    "A way to find groups by looking for crowded spots. Lonely points that are not in any crowd get called noise.",
    "Density-Based Spatial Clustering of Applications with Noise: points with at least minPts neighbours within ε are core points; clusters are density-connected regions; the rest is noise. No need to choose k.",
    ["unsup-dbscan"], ["cluster", "k-means", "outlier"]);
  e("decision-boundary", "Decision boundary", ["boundary", "decision line"],
    "The invisible line a model draws to split one group from another.",
    "The surface in feature space where the classifier's predicted class changes. Linear models give hyperplanes; trees give axis-aligned boxes; neural networks give curves.",
    ["sup-fruit", "nn-playground", "nn-neuron"], ["classifier", "linearly-separable"]);
  e("decision-tree", "Decision tree", ["tree", "trees", "decision stump", "gini impurity"],
    "A game of twenty questions: the computer asks yes-or-no questions until it reaches an answer.",
    "A model that recursively splits feature space on thresholds chosen to reduce impurity (Gini or entropy). Readable, but deep trees overfit; depth limits regularise.",
    ["sup-forest", "ens-boost", "ai-twenty"], ["random-forest", "boosting", "information-gain"]);
  e("denoise", "Denoise", ["denoising", "denoiser", "reverse process"],
    "Cleaning the fuzz off a noisy picture, a little at a time.",
    "In diffusion, the learned reverse process: a network predicts the noise in x_t (or x_0) so it can be subtracted step by step from pure noise.",
    ["diff-noise", "diff-train"], ["diffusion", "noise", "step"]);
  e("diffusion", "Diffusion model", ["diffusion", "diffusion models", "ddpm", "stable diffusion"],
    "A picture-maker that learned by watching pictures turn into fuzz, then learned to run that backwards: fuzz into pictures.",
    "A generative model that learns to reverse a gradual Gaussian noising process (DDPM, 2020). Sampling starts from noise and denoises over many steps, often in a latent space.",
    ["diff-train", "diff-noise", "diff-guide"], ["denoise", "noise", "guidance"]);
  e("dijkstra", "Dijkstra's algorithm", ["dijkstra", "shortest path"],
    "A careful way to find the shortest path by always exploring the nearest unexplored spot next.",
    "Uniform-cost search for single-source shortest paths with non-negative edge weights, using a priority queue on path cost. A* with h = 0.",
    ["ai-pathfinder", "robo-plan"], ["a-star", "graph"]);
  e("distribution-shift", "Distribution shift", ["covariate shift", "concept drift", "drift", "dataset shift"],
    "When the world changes after the model learned, like a fruit sorter trained in summer seeing winter fruit.",
    "A mismatch between training and deployment distributions: covariate shift (inputs change), label shift or concept drift (the input-output relation changes).",
    ["ai-fails", "time-anomaly", "game-sail"], ["generalisation", "challenge"]);
  e("dropout", "Dropout", ["drop out", "inverted dropout", "co-adaptation"],
    "While practising, a network switches off random neurons, so no single neuron can do all the work. The team gets tougher.",
    "A regulariser that zeroes each activation with probability p during training (scaling the rest by 1/(1-p)), preventing co-adaptation; it is switched off at test time.",
    ["nn-dropout"], ["regularisation", "overfitting", "neuron"]);
  e("early-stopping", "Early stopping", ["stop early"],
    "Stop practising when the test score starts getting worse, before the model starts memorising.",
    "Halting training when validation loss stops improving, a simple regulariser that picks the epoch with best generalisation.",
    ["sup-overfit", "nn-dropout"], ["overfitting", "validation-set"]);
  e("embedding", "Embedding", ["embeddings", "vector", "vectors"],
    "A list of numbers that stands for a word or picture. Things that mean similar stuff get similar numbers.",
    "A learned dense vector representation in which geometric closeness reflects semantic similarity, such as word2vec or CLIP embeddings.",
    ["lang-embed", "vlm-match", "graph-gnn"], ["cosine-similarity", "latent-space", "clip"]);
  e("emergence", "Emergence", ["emergent", "emergent behaviour"],
    "When lots of simple parts following simple rules make something surprising and clever together, like a flock or an ant trail.",
    "Global patterns arising from local interactions that are not explicitly programmed, as in boids, ant colonies or self-play strategies.",
    ["game-ants", "game-fish", "game-bees", "game-hide"], ["boids", "swarm-intelligence"]);
  e("ensemble", "Ensemble", ["ensembles", "wisdom of the crowd"],
    "Asking lots of models and combining their answers. A crowd of okay guessers often beats one expert.",
    "Combining multiple models by averaging, voting or stacking to reduce error, usually by reducing variance (bagging) or bias (boosting).",
    ["ens-wisdom", "ens-compare"], ["bagging", "boosting", "random-forest"]);
  e("environment", "Environment", ["world", "simulation"],
    "The world an agent lives in: the maze, the game or the road.",
    "In RL, the system that receives actions and returns the next state and a reward, formalised as a Markov decision process.",
    ["rl-maze", "rl-balance", "game-drone"], ["agent", "state", "markov-decision-process"]);
  e("epoch", "Epoch", ["epochs", "pass"],
    "One full trip through all the practice examples.",
    "One pass over the entire training set; training usually runs many epochs, often in mini-batches.",
    ["nn-playground", "nn-lr"], ["training", "mini-batch"]);
  e("epsilon-greedy", "Epsilon-greedy", ["ε-greedy", "epsilon"],
    "Most of the time pick your favourite; once in a while pick something random, just in case it is even better.",
    "An exploration policy: with probability ε take a random action, otherwise the greedy (highest estimated value) action. ε is often decayed over time.",
    ["rl-bandit", "rl-maze", "rl-snake"], ["exploration", "q-value"]);
  e("error", "Error", ["mistake", "residual", "residuals"],
    "How far off a guess was from the right answer.",
    "The difference between prediction and target (residual). Aggregated by a loss function such as mean squared error.",
    ["sup-line", "nn-neuron"], ["loss-function", "mean-squared-error"]);
  e("explainability", "Explainability", ["explain", "explainable ai", "xai", "interpretability", "saliency"],
    "Asking the AI \"why?\" and getting an answer a person can check, like which part of the picture made it say cat.",
    "Methods that reveal why a model made a prediction: feature importance, permutation importance, occlusion sensitivity, saliency maps, or inherently interpretable models.",
    ["ethics-explain", "vision-guess"], ["feature-importance", "bias"]);
  e("exploration", "Exploration", ["explore", "exploit", "exploitation", "exploration vs exploitation"],
    "Trying new things to learn more, instead of always doing what already worked. Too little and you miss better ideas.",
    "The exploration-exploitation trade-off: gathering information about uncertain options versus using current best estimates. Central to RL, bandits and search.",
    ["rl-bandit", "rl-maze", "opt-anneal"], ["epsilon-greedy", "bandit", "simulated-annealing"]);
  e("feature", "Feature", ["features", "input", "inputs", "attribute"],
    "A clue the computer looks at, like a fruit's colour or size.",
    "A measurable input variable to a model. Feature engineering creates informative features (interactions, polynomials); feature selection drops useless ones.",
    ["data-features", "sup-fruit", "data-scale"], ["feature-engineering", "scaling", "label"]);
  e("feature-engineering", "Feature engineering", ["interaction feature", "polynomial features", "feature selection"],
    "Inventing better clues from the ones you have, like turning height and width into area.",
    "Constructing new input variables (ratios, interactions, polynomial terms, encodings) that make patterns easier for a model to learn; selecting the useful ones.",
    ["data-features", "sup-overfit"], ["feature", "polynomial-regression"]);
  e("feature-importance", "Feature importance", ["permutation importance", "importance"],
    "A score for how much each clue helped the model decide.",
    "Measures of each feature's contribution, such as impurity decrease in trees or permutation importance, the drop in score when a feature's values are shuffled.",
    ["ethics-explain", "sup-forest"], ["explainability", "feature"]);
  e("feature-map", "Feature map", ["feature maps", "activation map"],
    "The new picture you get after a pattern-finder slides over an image, glowing where the pattern was found.",
    "The output of applying one convolutional filter across an input, one channel of a layer's activations.",
    ["vision-scan"], ["convolution", "filter", "cnn"]);
  e("federated-learning", "Federated learning", ["federated", "differential privacy", "privacy"],
    "Teaching a model on lots of phones without the photos ever leaving the phones. Only the lessons travel.",
    "Training across many devices that share model updates rather than raw data, often combined with differential privacy, which adds calibrated noise to bound what can be learned about any person.",
    ["ai-privacy"], ["privacy", "data"]);
  e("filter", "Filter", ["filters", "edge detector"],
    "A tiny pattern-finder that lights up when it sees something, like an edge or a stripe.",
    "A small learned or hand-made kernel convolved with an image to produce a feature map; early CNN filters resemble edge and colour detectors.",
    ["vision-scan", "vision-pixels", "audio-pitch"], ["convolution", "cnn", "feature-map"]);
  e("fitness", "Fitness function", ["fitness", "fitness score", "objective"],
    "A score saying how good each try is, so evolution can keep the best ones.",
    "The objective evaluated for each candidate in an evolutionary algorithm; selection favours high-fitness individuals.",
    ["opt-genetic", "game-walker", "game-rocket", "game-sumo"], ["genetic-algorithm", "generation", "reward"]);
  e("forecast", "Forecast", ["forecasting", "prediction interval"],
    "A smart guess about what comes next, like tomorrow's temperature, often with a range for how sure you are.",
    "A prediction of future values of a time series, ideally with prediction intervals. Multi-step forecasts accumulate error.",
    ["time-forecast", "time-trend"], ["trend", "seasonality", "autoregressive"]);
  e("frame", "Frame", ["frames", "frame rate", "fps"],
    "One still picture in a video. Show lots quickly and they look like moving.",
    "A single image in a video sequence; frame rate is frames per second. Video models predict or interpolate frames.",
    ["video-next", "video-interp", "video-flow"], ["optical-flow", "interpolation", "rollout"]);
  e("gan", "GAN (generative adversarial network)", ["gan", "gans", "generator", "discriminator", "mode collapse"],
    "Two networks play a game: one makes fakes, the other spots fakes. Both get better until the fakes look real.",
    "A generator G and discriminator D trained in a minimax game; G maps noise to samples, D tells real from fake. Prone to instability and mode collapse.",
    ["diff-gan"], ["diffusion", "minimax"]);
  e("generalisation", "Generalisation", ["generalise", "generalization", "generalize", "unseen data"],
    "Doing well on brand new examples, not just the ones you practised.",
    "A model's performance on unseen data from the same distribution; the gap between training and test error measures how well it generalises.",
    ["sup-traintest", "sup-overfit", "game-goalie"], ["overfitting", "test-set"]);
  e("generation", "Generation", ["generations"],
    "One round of evolution: test everyone, keep the best, make children, repeat.",
    "One iteration of an evolutionary algorithm: evaluate the population, select, apply crossover and mutation, form the next population.",
    ["opt-genetic", "game-walker", "game-rocket", "game-dino"], ["genetic-algorithm", "fitness", "mutation"]);
  e("generative-model", "Generative model", ["generative", "generative ai", "genai"],
    "A model that can make new things, like pictures, music or stories, that look like the ones it learned from.",
    "A model of the data distribution p(x) that can sample new data: autoregressive models, VAEs, GANs, diffusion models.",
    ["gen-vae", "diff-train", "audio-music"], ["vae", "gan", "diffusion"]);
  e("genetic-algorithm", "Genetic algorithm", ["evolution", "evolutionary algorithm", "neuroevolution"],
    "Solving problems like nature does: make lots of tries, keep the best, mix and wiggle them, repeat.",
    "A population-based optimiser using selection, crossover and mutation on genomes scored by fitness. Neuroevolution evolves neural network weights this way.",
    ["opt-genetic", "game-walker", "game-rocket", "game-dino", "game-sumo", "game-space"], ["fitness", "mutation", "crossover"]);
  e("goodharts-law", "Goodhart's law", ["goodhart", "proxy goal"],
    "When a score becomes the goal, people (and AIs) find sneaky ways to win the score without doing the real job.",
    "\"When a measure becomes a target, it ceases to be a good measure.\" The root of reward hacking and specification gaming.",
    ["rl-hack", "lang-rlhf"], ["reward-hacking", "alignment"]);
  e("gradient-descent", "Gradient descent", ["gradient", "gradients", "sgd", "stochastic gradient descent"],
    "Walking downhill in the fog: feel which way is down and take a small step, again and again, to reach the lowest error.",
    "Iteratively updating parameters θ ← θ − η ∇L(θ). Stochastic or mini-batch versions estimate the gradient from a subset of data.",
    ["sup-line", "nn-lr", "nn-backprop"], ["learning-rate", "loss-function", "backpropagation"]);
  e("graph", "Graph", ["graphs", "node", "nodes", "edge", "edges", "network graph"],
    "Dots joined by lines, like friends connected on a map or towns joined by roads.",
    "A set of nodes V and edges E, possibly directed or weighted. Used for social networks, the web, road maps and molecules.",
    ["graph-social", "graph-pagerank", "graph-gnn", "ai-pathfinder"], ["pagerank", "message-passing", "a-star"]);
  e("guidance", "Guidance", ["classifier-free guidance", "cfg", "guidance scale", "prompt guidance"],
    "A nudge that pushes a picture-maker to follow your words more closely. Turn it up too far and pictures get weird.",
    "Classifier-free guidance steers diffusion by extrapolating from the unconditional noise prediction toward the text-conditioned one with scale w; higher w trades diversity for prompt adherence.",
    ["diff-guide"], ["diffusion", "clip", "prompt"]);
  e("hallucination", "Hallucination", ["hallucinate", "hallucinating", "making things up"],
    "When a chatbot says something confidently that is simply not true.",
    "Fluent model output that is unsupported by the input or by facts, arising because LLMs predict plausible tokens rather than verify claims.",
    ["lang-follow", "vlm-ask", "ai-fails"], ["next-token", "calibration", "retrieval"]);
  e("heuristic", "Heuristic", ["heuristics", "rule of thumb", "admissible"],
    "A good-enough rule of thumb that helps you guess quickly, like \"head towards the exit\".",
    "A problem-specific estimate guiding search, such as straight-line distance in A*. Admissible heuristics never overestimate the true cost.",
    ["ai-pathfinder", "ai-chess", "robo-plan"], ["a-star", "search", "evaluation-function"]);
  e("hill-climbing", "Hill climbing", ["local search", "greedy search"],
    "Always step to the neighbour that is a bit better. Simple, but you can get stuck on a small hill.",
    "A local search that repeatedly moves to an improving neighbour; it stops at local optima unless given restarts or randomness.",
    ["opt-anneal", "opt-tune"], ["local-optimum", "simulated-annealing"]);
  e("hyperparameter", "Hyperparameter", ["hyperparameters", "grid search", "random search", "tuning"],
    "A setting you pick before learning starts, like how big each step is or how many trees to grow.",
    "A configuration value not learned from data (learning rate, k, depth, dropout rate), chosen by grid search, random search or Bayesian optimisation on validation data.",
    ["opt-tune", "nn-lr"], ["learning-rate", "cross-validation", "validation-set"]);
  e("interpolation", "Interpolation", ["interpolate", "in-between", "frame interpolation", "tweening"],
    "Filling in the missing middle, like drawing the frames between two pictures so the motion looks smooth.",
    "Estimating values between known samples: linear blending, or motion-compensated frame interpolation that warps frames along optical flow.",
    ["video-interp", "gen-latent"], ["optical-flow", "frame", "latent-space"]);
  e("k", "K", ["k value", "number of clusters"],
    "How many groups (or neighbours) you ask for. You pick it before the computer starts.",
    "A hyperparameter: the number of clusters in k-means (chosen by the elbow method or silhouette score) or neighbours in k-NN.",
    ["unsup-kmeans", "sup-fruit"], ["k-means", "k-nearest-neighbours", "hyperparameter"]);
  e("k-means", "K-means", ["k-means clustering", "kmeans", "elbow", "inertia", "k-means++"],
    "Drop k pins, let every point join its nearest pin, move each pin to the middle of its gang, repeat.",
    "Clustering that minimises within-cluster sum of squares (inertia) by alternating assignment and centroid update; k-means++ picks smart starting centres.",
    ["unsup-kmeans"], ["centroid", "cluster", "k"]);
  e("k-nearest-neighbours", "K-nearest neighbours", ["k-nn", "knn", "nearest neighbour", "nearest neighbours"],
    "To guess what something is, look at the few examples closest to it and go with the majority.",
    "An instance-based (lazy) method that predicts by majority vote or average of the k closest training points under a distance such as Euclidean.",
    ["sup-fruit", "vision-teach"], ["k", "classifier", "curse-of-dimensionality"]);
  e("kalman-filter", "Kalman filter", ["kalman", "sensor fusion"],
    "A way to guess where something really is by blending a prediction with noisy sensor readings, trusting whichever is steadier.",
    "An optimal recursive estimator for linear-Gaussian systems: predict state and covariance with a motion model, then correct with a measurement weighted by the Kalman gain.",
    ["robo-sense"], ["bayes-rule", "noise"]);
  e("kinematics", "Kinematics", ["forward kinematics", "inverse kinematics", "ik"],
    "Working out where a robot's hand ends up from its joint angles, or which angles reach a spot.",
    "Forward kinematics maps joint angles to end-effector pose; inverse kinematics solves the reverse, analytically or iteratively.",
    ["robo-arm", "game-arm"], ["pid", "path-planning"]);
  e("label", "Label", ["labels", "labelled", "target", "answer"],
    "The right answer stuck on an example, like a photo marked \"cat\".",
    "The target value y for a training example in supervised learning. Noisy or biased labels limit what a model can learn.",
    ["sup-fruit", "vision-teach", "sup-spam"], ["supervised-learning", "classifier"]);
  e("language-model", "Language model", ["llm", "llms", "large language model", "chatbot", "gpt"],
    "A program that learned from huge amounts of text to guess the next word, so well that it can chat and write.",
    "A model of p(token | previous tokens). Large language models are transformers with billions of parameters pre-trained on text, then fine-tuned (instruction tuning, RLHF).",
    ["lang-tokens", "lang-follow", "lang-rlhf", "lang-temp"], ["next-token", "transformer", "token"]);
  e("latent-space", "Latent space", ["latent", "latents", "latent code", "latent vector"],
    "A secret map where each spot stands for a picture. Walk between two spots and one picture slowly morphs into the other.",
    "The low-dimensional space of hidden codes z learned by an autoencoder, VAE or GAN; nearby points decode to similar outputs.",
    ["gen-latent", "gen-vae", "diff-train"], ["autoencoder", "vae", "embedding"]);
  e("layer", "Layer", ["layers", "hidden layer", "hidden layers", "deep"],
    "A row of neurons. Stack many rows and the network can learn more complicated ideas.",
    "A set of neurons that transform inputs together, such as dense, convolutional or attention layers. \"Deep\" learning means many hidden layers.",
    ["nn-playground", "nn-backprop"], ["neuron", "neural-network"]);
  e("learning-rate", "Learning rate", ["step size", "lr"],
    "How big a step the model takes when it learns. Too big and it bounces about; too small and it takes forever.",
    "The scalar η multiplying the gradient in each update. Too large diverges or oscillates; too small converges slowly. Often scheduled or adapted.",
    ["nn-lr", "sup-line"], ["gradient-descent", "hyperparameter", "adam"]);
  e("likelihood", "Likelihood", ["likely"],
    "How well a guess explains what you saw.",
    "P(data | parameters or hypothesis), viewed as a function of the parameters. Maximum likelihood picks the parameters that make the data most probable.",
    ["prob-bayes", "sup-spam"], ["bayes-rule", "prior"]);
  e("linear-regression", "Linear regression", ["line of best fit", "least squares", "regression"],
    "Drawing the straight line that passes as close as possible to all the dots.",
    "Fitting y = w·x + b by minimising squared error (ordinary least squares), solved in closed form or by gradient descent.",
    ["sup-line", "time-trend"], ["mean-squared-error", "gradient-descent", "polynomial-regression"]);
  e("linearly-separable", "Linearly separable", ["separable"],
    "When one straight line can split the two groups perfectly.",
    "Classes that a hyperplane can separate exactly; a single perceptron converges only on such data, while XOR needs a hidden layer.",
    ["nn-neuron", "nn-playground"], ["neuron", "decision-boundary"]);
  e("local-optimum", "Local optimum", ["local minimum", "local minima", "local maximum", "stuck"],
    "A spot that looks best from where you stand, but there is a better one further away.",
    "A point better than all its neighbours but not globally best. Greedy methods get trapped; randomness, restarts and annealing help escape.",
    ["opt-anneal", "opt-genetic", "nn-lr"], ["hill-climbing", "simulated-annealing", "loss-landscape"]);
  e("logistic-regression", "Logistic regression", ["logistic", "log-odds", "log-loss", "cross-entropy"],
    "A model that draws a line and then turns distance from the line into a yes-or-no chance.",
    "A linear classifier passing w·x + b through the sigmoid to give a probability, trained by minimising log-loss (binary cross-entropy).",
    ["sup-spam", "ethics-calibrate"], ["classifier", "activation-function", "loss-function"]);
  e("loss-function", "Loss function", ["loss", "cost function", "objective function"],
    "A score for how wrong the model is. Learning means making this score smaller.",
    "A function L(ŷ, y) measuring prediction error, such as MSE for regression or cross-entropy for classification; training minimises its average.",
    ["sup-line", "nn-backprop", "nn-lr"], ["gradient-descent", "mean-squared-error", "error"]);
  e("loss-landscape", "Loss landscape", ["error surface", "landscape"],
    "A pretend hilly land where height is how wrong the model is. Learning is rolling down to a valley.",
    "The loss as a function of parameters; its valleys, ridges and plateaus shape how optimisers behave.",
    ["nn-lr", "opt-anneal"], ["gradient-descent", "local-optimum"]);
  e("markov-chain", "Markov chain", ["markov", "markov property", "transition matrix", "n-gram"],
    "A random walk where your next step only depends on where you are now, not how you got there.",
    "A stochastic process with the Markov property, defined by a transition matrix; ergodic chains converge to a stationary distribution. N-gram text models are Markov chains over words.",
    ["prob-markov", "lang-follow", "graph-pagerank"], ["markov-decision-process", "pagerank", "probability"]);
  e("markov-decision-process", "Markov decision process", ["mdp"],
    "The rule book for a learning game: places you can be, moves you can make, and prizes you get.",
    "A tuple (S, A, P, R, γ) of states, actions, transition probabilities, rewards and discount, the formal setting of reinforcement learning.",
    ["rl-maze", "rl-balance"], ["state", "action", "reward"]);
  e("mean-squared-error", "Mean squared error", ["mse", "mean absolute error", "mae", "rmse"],
    "Square each miss so big misses count extra, then average them.",
    "MSE = (1/n) Σ (ŷ − y)²; MAE uses absolute values and is less sensitive to outliers. RMSE is the square root of MSE in the target's units.",
    ["sup-line", "time-forecast"], ["loss-function", "error"]);
  e("memory", "Memory (for agents)", ["external memory", "long-term memory", "notes"],
    "A notebook an AI helper writes in so it can remember things after they fall out of its short memory.",
    "Persisting information outside the context window (notes, summaries, vector stores) and retrieving relevant items back into context when needed.",
    ["agent-memory"], ["context-window", "retrieval"]);
  e("message-passing", "Message passing", ["graph neural network", "gnn", "gnns", "gcn"],
    "Each dot in a graph listens to its neighbours and updates what it thinks, round after round.",
    "The core of graph neural networks: each node aggregates (sum, mean, max) transformed features from its neighbours and updates its embedding; k rounds reach k hops.",
    ["graph-gnn", "graph-social"], ["graph", "embedding"]);
  e("mini-batch", "Mini-batch", ["batch", "batches", "batch size"],
    "A small handful of examples looked at together before taking one learning step.",
    "A subset of training data used to estimate the gradient for one update; batch size trades noise against compute.",
    ["nn-playground", "nn-lr"], ["gradient-descent", "epoch"]);
  e("minimax", "Minimax", ["negamax", "game tree"],
    "Plan your move by assuming your opponent will always make their best reply.",
    "Adversarial search that maximises your score assuming the opponent minimises it, recursing over the game tree to a depth, with an evaluation function at the leaves.",
    ["ai-minimax", "ai-chess", "game-rps"], ["alpha-beta", "evaluation-function", "search"]);
  e("evaluation-function", "Evaluation function", ["evaluation", "board evaluation"],
    "A quick score for how good a game position looks, used when you cannot think all the way to the end.",
    "A heuristic estimate of a position's value used at depth-limited leaves in minimax, such as weighted material and mobility in chess.",
    ["ai-chess", "ai-minimax"], ["minimax", "heuristic"]);
  e("model", "Model", ["models"],
    "The thing a computer builds while learning, a bit like a recipe for turning clues into answers.",
    "A parameterised function f_θ(x) fitted to data. Training chooses θ; inference applies f_θ to new inputs.",
    ["intro-ml", "sup-line"], ["training", "prediction", "parameter"]);
  e("monte-carlo", "Monte Carlo method", ["monte carlo", "random sampling", "simulation"],
    "Answering a hard question by trying it at random lots and lots of times and counting what happens.",
    "Estimating quantities by repeated random sampling; error shrinks like 1/sqrt(n). Used for integrals, probabilities and tree search (MCTS).",
    ["prob-monte", "prob-clt"], ["probability", "central-limit-theorem"]);
  e("mutation", "Mutation", ["mutate", "mutation rate"],
    "A small random change to a child's recipe, which sometimes makes it better.",
    "A genetic operator that randomly perturbs a genome (bit flips, Gaussian noise) to maintain diversity; the rate trades exploration against stability.",
    ["opt-genetic", "game-walker", "game-dino", "game-sumo"], ["genetic-algorithm", "crossover", "exploration"]);
  e("naive-bayes", "Naive Bayes", ["naive bayes", "multinomial naive bayes", "laplace smoothing", "add-one smoothing"],
    "A spam spotter that counts which words show up in spam and which in normal emails, then adds up the clues.",
    "A probabilistic classifier applying Bayes' rule with the naive assumption that features are conditionally independent given the class; smoothing avoids zero probabilities.",
    ["sup-spam"], ["bayes-rule", "classifier"]);
  e("neural-network", "Neural network", ["neural network", "neural networks", "neural net", "mlp", "multi-layer perceptron", "deep learning"],
    "Lots of tiny maths cells (neurons) joined in layers. Together they can learn almost any pattern.",
    "A composition of layers of weighted sums and non-linear activations, trained by backpropagation; a universal function approximator.",
    ["nn-playground", "nn-car", "nn-neuron"], ["neuron", "layer", "backpropagation"]);
  e("neuron", "Neuron", ["neurons", "perceptron", "unit"],
    "A tiny maths cell: it multiplies its inputs by weights, adds them up and decides how strongly to fire.",
    "A unit computing activation(Σ w_i x_i + b). A single one with a step activation is Rosenblatt's perceptron.",
    ["nn-neuron", "nn-playground"], ["weight", "activation-function", "bias-term"]);
  e("next-token", "Next-token prediction", ["next word prediction", "next token", "predict the next word"],
    "The one trick a language model learns: guess what word comes next. Do it over and over and you get a story.",
    "The language-modelling objective: maximise log p(x_t | x_<t) over a corpus. Generation samples one token at a time and feeds it back.",
    ["lang-follow", "lang-tokens", "lang-temp"], ["token", "language-model", "temperature"]);
  e("noise", "Noise", ["noisy", "random noise", "gaussian noise", "static"],
    "Random fuzz that hides the real signal, like static on a radio or speckles on a photo.",
    "Random variation unrelated to the signal; in diffusion, Gaussian noise added in the forward process; in data, measurement error and label noise.",
    ["diff-noise", "diff-train", "sup-overfit"], ["denoise", "diffusion", "kalman-filter"]);
  e("non-max-suppression", "Non-max suppression", ["nms"],
    "When a detector draws lots of boxes on the same cat, keep the most confident one and throw away the copies.",
    "Post-processing that keeps the highest-scoring box and removes others whose IoU with it exceeds a threshold, repeated per class.",
    ["vision-detect"], ["bounding-box", "object-detection"]);
  e("object-detection", "Object detection", ["detection", "detector", "yolo"],
    "Finding every thing in a picture and drawing a box round each one with its name.",
    "Predicting class labels plus bounding boxes for all objects in an image, evaluated by mean average precision at IoU thresholds.",
    ["vision-detect"], ["bounding-box", "non-max-suppression", "cnn"]);
  e("optical-flow", "Optical flow", ["flow", "motion vectors", "lucas-kanade", "block matching"],
    "Little arrows showing which way each bit of a video is moving from one frame to the next.",
    "The apparent per-pixel motion field between frames, estimated by block matching, Lucas–Kanade (brightness constancy plus local smoothness) or deep networks such as RAFT.",
    ["video-flow", "video-interp"], ["frame", "interpolation"]);
  e("outlier", "Outlier", ["outliers", "odd one out"],
    "A data point far away from all the others, maybe a mistake, maybe something special.",
    "An observation far from the bulk of the data, detected with z-scores, IQR rules or density methods; it can distort means and least-squares fits.",
    ["data-clean", "unsup-dbscan", "time-anomaly"], ["anomaly", "z-score", "dbscan"]);
  e("overfitting", "Overfitting", ["overfit", "overfits", "memorising", "memorizing", "memorisation"],
    "When a model memorises its practice examples, including the mistakes, instead of learning the real pattern, so it flops on new ones.",
    "When a model fits noise in the training data, giving low training error but high test error. Countered by more data, regularisation, dropout, early stopping or simpler models.",
    ["sup-overfit", "nn-dropout", "sup-traintest"], ["regularisation", "test-set", "bias-variance"]);
  e("pagerank", "PageRank", ["page rank", "random surfer"],
    "A web page is important if important pages link to it. Count it by imagining someone clicking links at random forever.",
    "Google's algorithm ranking nodes by the stationary distribution of a random surfer who follows links with probability d (about 0.85) and teleports otherwise; computed by power iteration.",
    ["graph-pagerank", "graph-search"], ["graph", "markov-chain"]);
  e("parameter", "Parameter", ["parameters", "params"],
    "A knob inside a model that learning turns. Big models have billions of them.",
    "A learned quantity of a model, such as weights and biases, set by training; distinct from hyperparameters chosen beforehand.",
    ["nn-neuron", "lang-tokens"], ["weight", "hyperparameter", "model"]);
  e("path-planning", "Path planning", ["motion planning", "rrt", "route planning"],
    "Working out a safe route for a robot from here to there without bumping into things.",
    "Computing a collision-free path through configuration space, using grid search (A*), sampling methods (RRT, PRM) or potential fields.",
    ["robo-plan", "ai-pathfinder", "game-parking", "game-drone"], ["a-star", "kinematics"]);
  e("pca", "PCA (principal component analysis)", ["pca", "principal component", "principal components", "dimensionality reduction", "explained variance"],
    "Finding the direction where the dots are most spread out, so you can describe them with fewer numbers and lose little.",
    "Projecting data onto orthogonal directions of maximal variance, the eigenvectors of the covariance matrix; the explained variance ratio says how much each keeps.",
    ["unsup-pca"], ["curse-of-dimensionality", "feature", "variance"]);
  e("pid", "PID controller", ["pid", "proportional", "integral", "derivative", "feedback control"],
    "A steering helper that looks at how far off it is now, how long it has been off, and how fast that is changing.",
    "A feedback controller u = Kp·e + Ki·∫e + Kd·de/dt. Tuning gains trades speed, overshoot and steady-state error; integrator windup is a classic pitfall.",
    ["robo-pid", "game-drone", "game-boat"], ["kinematics", "feedback-loop"]);
  e("feedback-loop", "Feedback loop", ["feedback", "filter bubble", "filter bubbles"],
    "When a system's output changes its own next input, like recommendations shaping what you watch, which shapes the next recommendations.",
    "A cycle where outputs influence future inputs. Negative feedback stabilises (control); positive feedback can amplify bias or create filter bubbles.",
    ["robo-pid", "unsup-recommend", "ethics-bias"], ["pid", "bias"]);
  e("pitch", "Pitch", ["frequency", "fundamental frequency", "hertz", "hz", "autocorrelation"],
    "How high or low a sound is. A squeaky mouse is high pitch; a big drum is low.",
    "The perceived height of a sound, tied to the fundamental frequency f0 in hertz; estimated by autocorrelation or FFT peak picking, with octave errors a common failure.",
    ["audio-pitch", "audio-music"], ["spectrogram", "sequence"]);
  e("planning", "Plan", ["plan", "planner", "task planning"],
    "Breaking a big job into small steps before starting, and checking them off as you go.",
    "For agents, decomposing a goal into ordered sub-tasks (with preconditions and effects) and revising the plan as observations arrive.",
    ["agent-plan", "ai-agent"], ["agent-loop", "search", "chain-of-thought"]);
  e("policy", "Policy", ["policies", "policy gradient", "strategy"],
    "An agent's rule for what to do in each situation.",
    "A mapping π(a | s) from states to actions. Learned via value functions (Q-learning) or directly by policy gradient methods.",
    ["rl-balance", "rl-flappy", "game-hoops"], ["agent", "q-value", "reward"]);
  e("polynomial-regression", "Polynomial regression", ["polynomial", "curve fitting", "degree"],
    "Fitting a bendy curve instead of a straight line. More bends fit more dots but may wiggle wildly.",
    "Linear regression on polynomial features x, x², …, x^d; higher degree lowers bias but raises variance and overfitting risk.",
    ["sup-overfit"], ["overfitting", "linear-regression", "feature-engineering"]);
  e("pooling", "Pooling", ["max pooling", "downsampling"],
    "Shrinking a picture by keeping only the strongest signal in each little square.",
    "A down-sampling layer (max or average over windows) that reduces spatial size and adds tolerance to small shifts.",
    ["vision-scan"], ["cnn", "feature-map"]);
  e("precision", "Precision", ["precise", "positive predictive value"],
    "Of all the times the model shouted \"spam!\", how many really were spam?",
    "TP / (TP + FP): the fraction of positive predictions that are correct. Trades off against recall as the threshold moves.",
    ["sup-metrics", "sup-spam"], ["recall", "confusion-matrix", "f1"]);
  e("f1", "F1 score", ["f1", "f-score"],
    "One score that mixes precision and recall, so you cannot cheat by being great at only one.",
    "The harmonic mean of precision and recall: 2PR / (P + R).",
    ["sup-metrics"], ["precision", "recall"]);
  e("prediction", "Prediction", ["predict", "predictions", "inference", "guess"],
    "The model's answer for a new example it has never seen.",
    "The output ŷ = f_θ(x) of a trained model on an input; computing it is called inference.",
    ["intro-ml", "video-next", "time-forecast"], ["model", "forecast"]);
  e("prior", "Prior", ["priors", "prior belief", "base rate"],
    "What you believed before you saw the new clue.",
    "P(H): the probability of a hypothesis before observing evidence, combined with the likelihood via Bayes' rule. Base rates are priors.",
    ["prob-bayes", "sup-spam"], ["bayes-rule", "likelihood"]);
  e("probability", "Probability", ["chance", "odds", "probabilities"],
    "A number from 0 to 1 for how likely something is. 0 means never, 1 means always, 0.5 means half the time.",
    "A measure on events satisfying Kolmogorov's axioms; models often output a probability distribution over answers.",
    ["prob-bayes", "prob-monte", "rl-bandit"], ["bayes-rule", "calibration", "softmax"]);
  e("prompt", "Prompt", ["prompts", "prompting", "system prompt"],
    "The words you type to ask an AI to do something.",
    "The input text conditioning a language or image model; a system prompt sets instructions above the user's messages.",
    ["lang-follow", "diff-guide", "agent-tools"], ["prompt-injection", "language-model"]);
  e("prompt-injection", "Prompt injection", ["injection", "jailbreak", "indirect prompt injection"],
    "Sneaky instructions hidden in a web page or email that try to trick an AI helper into doing the wrong thing.",
    "An attack where untrusted content is interpreted as instructions by an LLM. Mitigated by data/instruction separation, least privilege tool access and human confirmation.",
    ["ethics-inject", "agent-tools"], ["prompt", "tool-use", "alignment"]);
  e("proxy-variable", "Proxy variable", ["proxy", "proxies"],
    "A clue that secretly stands in for something else, like a postcode hinting at someone's background.",
    "A feature correlated with a sensitive attribute, so dropping the attribute alone (fairness through unawareness) does not remove bias.",
    ["ethics-bias"], ["bias", "feature"]);
  e("q-value", "Q-value", ["q-learning", "q value", "q-table", "value function"],
    "A score for \"how good is it to do this move here?\", learned from trying and getting rewards.",
    "Q(s, a): expected discounted return after taking action a in state s. Q-learning updates Q(s,a) ← Q + α[r + γ max Q(s',·) − Q].",
    ["rl-maze", "rl-snake", "rl-flappy", "game-traffic"], ["reward", "policy", "epsilon-greedy"]);
  e("query-key-value", "Query, key and value", ["query", "key", "value", "qkv"],
    "Like a library: each word asks a question (query), every word has a label (key) and some content (value). Good matches get read more.",
    "In attention, inputs are projected to queries Q, keys K and values V; outputs are softmax(QK^T/√d)·V.",
    ["lang-attend"], ["attention", "transformer"]);
  e("random-forest", "Random forest", ["forest", "random forests"],
    "Lots of decision trees, each grown a bit differently, voting together.",
    "Bagged decision trees that also pick a random subset of features at each split, decorrelating the trees and reducing variance.",
    ["sup-forest", "ens-bagging"], ["decision-tree", "bagging", "ensemble"]);
  e("recall", "Recall", ["sensitivity", "true positive rate"],
    "Of all the real spam emails, how many did the model catch?",
    "TP / (TP + FN): the fraction of actual positives found. Raising recall usually lowers precision.",
    ["sup-metrics", "sup-spam"], ["precision", "confusion-matrix", "f1"]);
  e("reconstruction-error", "Reconstruction error", ["reconstruction", "reconstruction loss"],
    "How different the rebuilt copy is from the original. A big difference can mean something unusual.",
    "The distance between input x and decoded x̂ (often MSE); used as the autoencoder training loss and as an anomaly score.",
    ["gen-compress", "gen-odd"], ["autoencoder", "anomaly"]);
  e("regularisation", "Regularisation", ["regularization", "regularise", "l2", "l1", "weight decay", "penalty"],
    "Gentle rules that stop a model getting too fancy, so it learns the real pattern instead of memorising.",
    "Techniques that constrain model complexity to reduce overfitting: L1/L2 penalties on weights, dropout, early stopping, data augmentation.",
    ["sup-overfit", "nn-dropout"], ["overfitting", "dropout", "early-stopping"]);
  e("reinforcement-learning", "Reinforcement learning", ["rl", "trial and error"],
    "Learning by trying things and getting points for good moves, like training a puppy with treats.",
    "Learning a policy that maximises expected cumulative reward through interaction with an environment, via value-based, policy-gradient or evolutionary methods.",
    ["rl-maze", "rl-balance", "rl-flappy", "game-hoops", "game-traffic", "game-hide"], ["agent", "reward", "policy"]);
  e("retrieval", "Retrieval", ["rag", "retrieval-augmented generation", "search engine"],
    "Looking things up before answering, instead of relying only on memory.",
    "Fetching relevant documents (via TF-IDF, BM25 or embedding search) and placing them in a model's context, as in retrieval-augmented generation.",
    ["graph-search", "agent-memory"], ["tf-idf", "embedding", "memory"]);
  e("reward", "Reward", ["rewards", "points", "return"],
    "Points an agent gets for doing something good (or loses for something bad). It tries to collect as many as it can.",
    "A scalar signal r from the environment; the agent maximises the expected discounted return Σ γ^t r_t.",
    ["rl-maze", "rl-hack", "game-hoops", "game-glider"], ["reinforcement-learning", "reward-hacking", "q-value"]);
  e("reward-hacking", "Reward hacking", ["specification gaming", "reward shaping"],
    "When an AI finds a silly loophole to rack up points without doing what you meant.",
    "Exploiting flaws in a reward function to achieve high reward without the intended behaviour, an instance of Goodhart's law and a core alignment concern.",
    ["rl-hack"], ["goodharts-law", "alignment", "reward"]);
  e("rlhf", "RLHF", ["reinforcement learning from human feedback", "human feedback", "reward model", "preference"],
    "People pick which of two answers is better, and the chatbot learns to give answers people prefer.",
    "Reinforcement learning from human feedback: train a reward model on human preference comparisons (Bradley–Terry), then fine-tune the LLM with RL (for example PPO) against it.",
    ["lang-rlhf"], ["alignment", "language-model", "reward"]);
  e("robot", "Robot", ["robots", "robotics"],
    "A machine with sensors, a brain and motors that can sense, think and move in the real world.",
    "An embodied agent coupling perception (sensors, estimation), planning and control (actuators) in a feedback loop.",
    ["robo-arm", "robo-pid", "robo-sense", "game-arm"], ["pid", "kalman-filter", "kinematics"]);
  e("rollout", "Rollout", ["rollouts", "rolling out", "autoregressive rollout"],
    "Letting a model keep predicting from its own guesses, step after step, to see where it ends up. Small errors can snowball.",
    "Generating a trajectory by feeding predictions back as inputs; errors compound (exposure bias). Also an RL episode simulated under a policy.",
    ["video-next", "time-forecast"], ["autoregressive", "frame"]);
  e("sampling", "Sampling", ["sample", "samples", "sampling bias", "random sample"],
    "Picking some examples from a bigger crowd. Pick unfairly and your model learns a lopsided view.",
    "Selecting a subset of a population. Probability samples (random, stratified) support inference; convenience samples introduce sampling bias.",
    ["data-sampling", "ethics-bias", "prob-monte"], ["bias", "data"]);
  e("scaling", "Scaling", ["normalisation", "normalization", "standardisation", "min-max scaling", "z-score scaling"],
    "Squishing numbers onto the same size range, so a big number like house price does not drown out a small one like rooms.",
    "Transforming features to comparable ranges: min-max to [0, 1] or standardisation to zero mean, unit variance. Vital for distance-based methods and gradient descent.",
    ["data-scale", "sup-fruit"], ["feature", "k-nearest-neighbours", "z-score"]);
  e("search", "Search", ["searching", "tree search", "state space search"],
    "Trying out possible moves or routes in your head to find a good one.",
    "Systematically exploring a state space: uninformed (BFS, DFS), informed (A*), adversarial (minimax) or local (hill climbing).",
    ["ai-pathfinder", "ai-minimax", "ai-twenty", "graph-search"], ["a-star", "minimax", "heuristic"]);
  e("seasonality", "Season (seasonality)", ["season", "seasonal", "seasons", "cycle"],
    "A pattern that repeats on a schedule, like ice-cream sales every summer.",
    "A periodic component of a time series with a fixed period, separated via classical additive decomposition (trend + seasonal + residual).",
    ["time-season", "time-forecast"], ["trend", "forecast", "time-series"]);
  e("self-play", "Self-play", ["self play", "co-evolution", "arms race"],
    "An AI gets better by playing against copies of itself, so its opponent always matches its skill.",
    "Training agents against current or past versions of themselves, creating an automatic curriculum, as in AlphaZero and hide-and-seek experiments.",
    ["game-hide", "game-sumo", "game-rps"], ["reinforcement-learning", "emergence"]);
  e("sequence", "Sequence", ["sequences", "sequential", "order"],
    "Things that come in order, like notes in a song or words in a sentence. The order matters.",
    "Ordered data x_1 … x_T; sequence models (n-grams, RNNs, transformers) capture dependencies across positions.",
    ["audio-music", "lang-follow", "time-trend"], ["markov-chain", "autoregressive", "time-series"]);
  e("simulated-annealing", "Simulated annealing", ["annealing", "temperature schedule", "cooling"],
    "Searching while slowly calming down: early on you sometimes take worse steps to escape small hills, later you only go uphill.",
    "Local search that accepts worse moves with probability exp(−Δ/T) (Metropolis rule), lowering temperature T over time to escape local optima.",
    ["opt-anneal"], ["local-optimum", "hill-climbing", "temperature"]);
  e("softmax", "Softmax", ["soft max", "logits"],
    "A way to turn a list of scores into chances that add up to 100%.",
    "softmax(z)_i = e^{z_i} / Σ_j e^{z_j}, mapping logits to a probability distribution; dividing by a temperature first sharpens or flattens it.",
    ["lang-temp", "lang-attend"], ["probability", "temperature"]);
  e("spectrogram", "Spectrogram", ["spectrograms", "mel spectrogram", "fft", "fourier"],
    "A picture of sound: time goes across, pitch goes up, and brightness shows how loud each pitch is.",
    "A time-frequency representation from short-time Fourier transforms (FFT on windowed frames); mel spectrograms warp frequency to match hearing.",
    ["audio-ear", "audio-pitch"], ["pitch", "cnn", "classifier"]);
  e("state", "State", ["states", "observation", "observations"],
    "Everything the agent knows about where it is right now.",
    "The environment's situation s_t (or the agent's observation of it) on which the policy conditions its action.",
    ["rl-maze", "rl-balance", "game-traffic"], ["markov-decision-process", "action", "policy"]);
  e("step", "Step", ["steps", "timestep", "time step", "sampling steps"],
    "One small move in a longer process, like one bit of clean-up in a picture-maker.",
    "One iteration: a diffusion denoising step, a gradient update, or one environment timestep. Fewer diffusion steps are faster but rougher.",
    ["diff-noise", "diff-train"], ["denoise", "diffusion"]);
  e("supervised-learning", "Supervised learning", ["supervised", "learning from examples"],
    "Learning from examples that come with the right answers, like flashcards.",
    "Learning a mapping from inputs x to labels y using labelled pairs, for classification or regression.",
    ["sup-line", "sup-fruit", "sup-spam"], ["label", "classifier", "unsupervised-learning"]);
  e("swarm-intelligence", "Swarm intelligence", ["swarm", "particle swarm", "particle swarm optimisation", "pso", "bees", "waggle dance"],
    "Lots of simple creatures, like bees or birds, sharing tiny bits of information to solve big problems together.",
    "Collective problem solving by decentralised agents, as in particle swarm optimisation, ant colony optimisation and honeybee nest-site selection.",
    ["opt-swarm", "game-bees", "game-ants"], ["ant-colony", "boids", "emergence"]);
  e("temperature", "Temperature", ["sampling temperature", "top-p", "top-k", "nucleus sampling", "greedy decoding"],
    "A creativity knob for chatbots. Low means safe and predictable; high means surprising and sometimes silly.",
    "A divisor T applied to logits before softmax: T → 0 approaches greedy decoding, T > 1 flattens the distribution. Often combined with top-k or nucleus (top-p) sampling.",
    ["lang-temp"], ["softmax", "next-token", "probability"]);
  e("test-set", "Test set", ["test data", "hold-out", "held-out", "train-test split", "training set"],
    "Examples kept hidden while learning, then used like a surprise quiz to see if the model really learned.",
    "Data held out from training and model selection, used once to estimate generalisation error; the rest forms the training (and validation) set.",
    ["sup-traintest", "sup-overfit", "sup-metrics"], ["validation-set", "overfitting", "cross-validation"]);
  e("tf-idf", "TF-IDF", ["tf idf", "term frequency", "inverse document frequency", "bag of words"],
    "A way to find important words: count how often a word appears here, but give less credit to words that are everywhere, like \"the\".",
    "Term frequency times inverse document frequency log(N / df); documents become sparse vectors ranked by cosine similarity to a query.",
    ["graph-search"], ["retrieval", "cosine-similarity"]);
  e("time-series", "Time series", ["time-series", "timeline data"],
    "Numbers measured again and again over time, like daily temperatures.",
    "A sequence of observations indexed by time, analysed for trend, seasonality, autocorrelation and anomalies, and used for forecasting.",
    ["time-trend", "time-season", "time-forecast", "time-anomaly"], ["trend", "seasonality", "forecast"]);
  e("token", "Token", ["tokens", "tokenizer", "tokeniser", "tokenisation", "bpe"],
    "A small chunk of text, like a word or part of a word, that a language model reads one at a time.",
    "The unit of text a language model processes, produced by a tokeniser such as byte-pair encoding (BPE); each token id maps to an embedding.",
    ["lang-tokens", "lang-follow"], ["next-token", "embedding", "context-window"]);
  e("tool-use", "Tool", ["tool", "tools", "tool use", "function calling", "tool call"],
    "Something a helper AI can use beyond talking, like a calculator, a search box or a calendar.",
    "An external function an LLM can invoke via structured calls (function calling); results return as observations in the agent loop.",
    ["agent-tools", "agent-loop"], ["agent-loop", "agent", "prompt-injection"]);
  e("training", "Training", ["train", "trained", "learning", "fit"],
    "The practice time when a computer looks at lots of examples and slowly gets better.",
    "Fitting model parameters to data by minimising a loss, typically with gradient-based optimisation over many epochs.",
    ["intro-ml", "nn-playground", "sup-line"], ["model", "data", "gradient-descent"]);
  e("transformer", "Transformer", ["transformers"],
    "The design behind modern chatbots: stacks of attention layers that let every word look at every other word.",
    "An architecture (Vaswani et al., 2017) of stacked self-attention and feed-forward blocks with residual connections and positional information; the basis of GPT-style LLMs and ViTs.",
    ["lang-attend", "vlm-ask"], ["attention", "language-model", "token"]);
  e("trend", "Trend", ["trends", "moving average", "rolling mean"],
    "The general direction numbers are going, up or down, once you ignore the wobbles.",
    "The long-term component of a time series, estimated with moving averages or regression on time.",
    ["time-trend", "time-forecast"], ["seasonality", "forecast", "linear-regression"]);
  e("unsupervised-learning", "Unsupervised learning", ["unsupervised", "finding groups"],
    "Finding patterns in examples that have no answers attached, like sorting a pile of buttons without being told how.",
    "Learning structure from unlabelled data: clustering, dimensionality reduction, density estimation and representation learning.",
    ["unsup-kmeans", "unsup-pca", "unsup-dbscan"], ["cluster", "pca", "supervised-learning"]);
  e("vae", "VAE (variational autoencoder)", ["vae", "vaes", "variational autoencoder", "kl divergence"],
    "An autoencoder that learns a smooth secret map, so you can pick any spot on it and get a brand-new, sensible picture.",
    "An autoencoder whose encoder outputs a distribution q(z|x); training maximises the ELBO, reconstruction minus KL divergence to a prior N(0, I), giving a smooth, sampleable latent space.",
    ["gen-vae", "gen-latent"], ["autoencoder", "latent-space", "generative-model"]);
  e("validation-set", "Validation set", ["validation", "dev set", "validation data"],
    "A practice quiz used while tuning, separate from the final test.",
    "Held-out data used for model selection and hyperparameter tuning, keeping the test set untouched for a final unbiased estimate.",
    ["sup-traintest", "opt-tune"], ["test-set", "hyperparameter", "cross-validation"]);
  e("variance", "Variance", ["spread", "high variance", "standard deviation"],
    "How jumpy a model's answers are. High variance means a little change in examples gives very different answers.",
    "In statistics, E[(X − μ)²]; in learning, sensitivity of the fitted model to the training sample. Ensembles average to reduce it.",
    ["ens-compare", "ens-bagging", "unsup-pca"], ["bias-variance", "bagging", "ensemble"]);
  e("vlm", "Vision-language model", ["vlm", "vlms", "multimodal", "visual question answering", "vqa"],
    "An AI that can look at a picture and talk about it, answering questions like \"how many dogs are there?\".",
    "A model that jointly processes images and text, typically a vision encoder (patch embeddings) connected to a language model through projection or cross-attention.",
    ["vlm-ask", "vlm-caption", "vlm-match"], ["clip", "caption", "attention"]);
  e("weight", "Weight", ["weights", "connection strength"],
    "A number that says how much a neuron cares about each input. Learning means adjusting the weights.",
    "A learned coefficient multiplying an input in a neuron's weighted sum; the network's knowledge lives in its weights.",
    ["nn-neuron", "nn-backprop", "nn-playground"], ["neuron", "parameter", "backpropagation"]);
  e("z-score", "Z-score", ["z score", "standard score"],
    "How many \"usual wobbles\" away from average something is. Far away means unusual.",
    "z = (x − μ) / σ; values with |z| above about 3 are often flagged as outliers.",
    ["time-anomaly", "data-clean", "data-scale"], ["outlier", "anomaly", "scaling"]);
  e("pixel", "Pixel", ["pixels", "rgb"],
    "One tiny coloured dot. Pictures are made from thousands of them, each just a few numbers.",
    "The smallest element of a raster image, typically three 0–255 intensities for red, green and blue; an image is a height × width × channels array.",
    ["vision-pixels", "vision-scan"], ["filter", "cnn"]);
  e("privacy", "Privacy", ["private data", "data minimisation", "membership inference"],
    "Keeping people's personal stuff safe, even when it is used to teach an AI.",
    "Protecting individuals' data in ML: data minimisation, anonymisation, differential privacy and federated learning guard against attacks such as membership inference.",
    ["ai-privacy"], ["federated-learning", "bias"]);
  e("adapt", "Adapt", ["adapts", "adaptation", "adaptive"],
    "Changing how you act when things around you change, like an opponent spotting your favourite move.",
    "Updating behaviour online in response to new data, as in online learning, frequency-based opponent modelling or adaptive control.",
    ["game-rps", "game-goalie", "game-traffic"], ["distribution-shift", "self-play"]);
  e("uncertainty", "Uncertainty", ["uncertain", "confidence interval", "error bars"],
    "Not being completely sure. Good models say how unsure they are.",
    "Quantified lack of knowledge about predictions, expressed as probability distributions, intervals or ensembles' disagreement.",
    ["prob-monte", "ethics-calibrate", "time-forecast"], ["probability", "calibration", "forecast"]);
  e("ai", "Artificial intelligence", ["ai", "artificial intelligence"],
    "Getting computers to do things that seem clever, like playing games, finding routes or understanding words.",
    "The field building systems that perceive, reason, learn and act; machine learning is the part that learns from data rather than hand-written rules.",
    ["ai-agent", "intro-ml", "ai-fails"], ["machine-learning", "agent", "search"]);
  e("machine-learning", "Machine learning", ["ml"],
    "Teaching computers by showing examples instead of writing every rule by hand.",
    "Algorithms that improve at a task through experience (data), including supervised, unsupervised and reinforcement learning.",
    ["intro-ml"], ["ai", "supervised-learning", "training"]);
  e("information-gain", "Information gain", ["entropy", "information-gain"],
    "How much a question helps narrow down the answer. Great questions split things roughly in half.",
    "The reduction in entropy H = −Σ p log p after a split; decision trees and twenty-questions players choose the highest-gain question.",
    ["ai-twenty", "sup-forest"], ["decision-tree", "search"]);
  e("curriculum-learning", "Curriculum learning", ["curriculum"],
    "Learning easy things first, then harder ones, like a school year.",
    "Ordering training tasks from easy to hard (manually or automatically, as in self-play) to speed up and stabilise learning.",
    ["game-walker", "game-hide"], ["self-play", "challenge"]);
  e("lookahead", "Lookahead", ["look ahead", "foresight", "depth"],
    "Thinking a few moves into the future before acting.",
    "Simulating future states to a horizon before choosing an action, as in minimax depth, model-predictive control or planning.",
    ["ai-minimax", "ai-chess", "game-parking"], ["minimax", "planning"]);
  e("vision-transformer", "Patch embedding", ["patches", "vision transformer", "vit"],
    "Chopping a picture into little squares and turning each into a word-like token so a transformer can read it.",
    "Splitting an image into fixed-size patches, flattening and linearly projecting each to a token embedding, the input stage of vision transformers and many VLMs.",
    ["vlm-ask"], ["transformer", "vlm", "token"]);

  e("jitter", "Jitter", ["jittery", "sensor jitter", "measurement noise"],
    "Tiny random shakes in a reading, like a wobbly ruler that says 10, then 11, then 9 for the same thing.",
    "Small, fast, random fluctuation in a measured signal (high-frequency noise). Filters such as moving averages or a Kalman filter smooth it out by blending many readings.",
    ["robo-sense", "time-trend", "robo-pid"], ["noise", "kalman-filter"]);
  e("xor", "XOR problem", ["xor", "exclusive or"],
    "A puzzle where dots in opposite corners match: top-left and bottom-right are red, the other two are blue. No single straight line can split them.",
    "Exclusive-or: output 1 when exactly one input is 1. Its classes are not linearly separable, so a single perceptron fails; a hidden layer with a nonlinear activation, or a product feature x·y, solves it.",
    ["data-features", "nn-activation", "nn-playground"], ["linearly-separable", "activation-function", "feature-engineering"]);
  e("y-hat", "Y-hat (ŷ)", ["y hat", "ŷ", "predicted value", "y"],
    "The model's guess, written as y with a little hat. Plain y is the real answer; the hat means \"my best guess\".",
    "Notation for a model's prediction ŷ = f(x), compared to the true target y by the loss function, e.g. (y − ŷ)².",
    ["sup-line", "nn-neuron", "nn-backprop"], ["prediction", "label", "loss-function"]);

  e("gradient-boosting", "Gradient boosting", ["gbm", "gbdt", "gradient boosted trees", "pseudo-residuals", "residuals", "leftovers"],
    "A team of tiny trees built one after another. Each new tree learns the leftovers: how far off the team still is.",
    "Stagewise additive modelling F_m = F_(m−1) + ν h_m, where each tree h_m fits the negative gradient of the loss (for squared loss, the residuals y − F). Shrinkage ν trades rounds for generalisation.",
    ["ens-gbm", "ens-xgb", "ens-cat"], ["boosting", "learning-rate", "decision-tree"]);
  e("xgboost", "XGBoost", ["xgb", "extreme gradient boosting", "lightgbm", "min child weight"],
    "A famous, careful kind of boosting with brakes, so its trees do not chase every noisy dot.",
    "Gradient boosting with a regularised objective Σl + Σ(γT + ½λ‖w‖²) and second-order (gradient + hessian) tree fitting: leaf weight −G/(H+λ), split kept only if gain exceeds γ.",
    ["ens-xgb", "ens-gbm"], ["gradient-boosting", "regularisation", "overfitting"]);
  e("catboost", "CatBoost", ["ordered target statistics", "ordered boosting"],
    "A boosting method that is extra careful with names and categories, so it never peeks at the answer while learning.",
    "Gradient boosting (Prokhorenkova et al.) that encodes categorical features with ordered target statistics over a random permutation, and uses ordered boosting and oblivious trees to avoid prediction shift.",
    ["ens-cat"], ["target-encoding", "gradient-boosting", "boosting"]);
  e("target-encoding", "Target encoding", ["mean encoding", "target leakage", "leakage", "categorical feature", "category"],
    "Turning a name, like a snack, into a number: how often the answer was yes for it. Careful: done wrong, the number holds the answer.",
    "Replacing a category with a (smoothed) mean of the target for that category. Using a row's own label leaks the target; out-of-fold, leave-one-out or ordered statistics prevent this.",
    ["ens-cat"], ["catboost", "feature-engineering", "overfitting"]);

  L.sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
  if (typeof window !== "undefined") window.GLOSSARY = L;
  if (typeof module !== "undefined" && module.exports) module.exports = L;
})();

/**
 * 1st Petaling Jaya Boys' Brigade — 1stPJ Arcade Module
 *
 * Implements:
 * 1. Daily Wordle:
 *    - 5-letter BB-themed word puzzle (FAITH, DRILL, BADGE, SQUAD, ANCHR, FLINT, MAPLE, SCARF, etc.)
 *    - Daily deterministic word rotation based on calendar date.
 *    - 6 attempts with color-coded feedback (correct: green, present: gold, absent: muted grey).
 *    - Interactive on-screen QWERTY keyboard + physical typing support.
 *    - 15 Credits awarded on win.
 *
 * 2. BB Trivia:
 *    - Timed educational quizzes covering BB Object, Founder, Motto, 1st PJ history, drill commands & handbook syllabus.
 *    - 5 randomized multiple-choice questions per round with 15-second countdown timer.
 *    - Detailed handbook explanations upon answer selection.
 *    - 5 Credits awarded per correct answer (up to 25 Credits per round).
 *
 * 3. Credits & Daily Streak Engine:
 *    - Participation in either Wordle or Trivia increments the daily streak.
 *    - Streak is maintained with 1 play/day; resets to 1 if a day is missed.
 *    - Header badge displays Streak (fire icon with count on left) and Total Credits.
 *    - State persisted durably across localStorage, session storage & Supabase bb_config.
 *    - Preserves strict 388 unique DOM IDs invariant in index.html.
 */

(function() {
  'use strict';

  // ── BB-Themed Word Bank (5-Letter Words) ──────────────────────────────────
  var BB_WORDLE_WORDS = [
    'DRILL', 'BADGE', 'SQUAD', 'FAITH', 'BRAVE',
    'HONOR', 'MEDAL', 'LOYAL', 'CROSS', 'PILOT',
    'STAFF', 'MARCH', 'ORDER', 'SCOUT', 'UNITY',
    'FLAGS', 'BOOTS', 'BERET', 'CREST', 'TRUTH',
    'CUBIC', 'FLINT', 'MAPLE', 'SCARF', 'CADET',
    'HASTE', 'SHINE', 'KNOTS', 'GUARD', 'BUGLE',
    'DRUMS', 'STAND', 'PIPER', 'RALLY', 'STARS',
    'VALOR', 'SHARP', 'GUIDE', 'ANCHR', 'ROPEY'
  ];

  // ── Authentic 5-Letter Wordle Dictionary ( Dictionary Filter) ─────
  var WORDLE_VALID_WORDS_RAW =
    'ABACK ABASE ABATE ABBEY ABBOT ABHOR ABIDE ABLED ABODE ABORT ABOUT ABOVE ABUSE ABYSS ACORN' +
    'ACRID ACTOR ACUTE ADAGE ADAPT ADEPT ADMIN ADMIT ADOBE ADOPT ADORE ADORN ADULT AFFIX AFIRE' +
    'AFOOT AFOUL AFTER AGAIN AGAPE AGATE AGENT AGILE AGING AGLOW AGONY AGORA AGREE AHEAD AIDER' +
    'AISLE ALARM ALBUM ALERT ALGAE ALIBI ALIEN ALIGN ALIKE ALIVE ALLAY ALLEY ALLOT ALLOW ALLOY' +
    'ALOFT ALOHA ALONE ALONG ALOOF ALOUD ALPHA ALTAR ALTER AMASS AMAZE AMBER AMBLE AMEND AMISS' +
    'AMITY AMONG AMPLE AMPLY AMUSE ANGEL ANGER ANGLE ANGRY ANGST ANIME ANKLE ANNEX ANNOY ANNUL' +
    'ANODE ANTIC ANVIL AORTA APART APHID APING APNEA APPLE APPLY APRON APTLY ARBOR ARDOR ARENA' +
    'ARGUE ARISE ARMOR AROMA AROSE ARRAY ARROW ARSON ARTSY ASCOT ASHEN ASIDE ASKEW ASPIC ASSAY' +
    'ASSET ASTER ATOLL ATONE ATTIC AUDIO AUDIT AUGUR AUNTY AVAIL AVERT AVIAN AVOID AWAIT AWAKE' +
    'AWARD AWARE AWASH AWFUL AWOKE AXIAL AXIOM AXION AZURE BACON BADGE BADLY BAGEL BAGGY BAKER' +
    'BALER BALMY BALSA BANAL BANJO BARGE BARON BASAL BASIC BASIL BASIN BASIS BASTE BATCH BATHE' +
    'BATON BATTY BAWDY BAYOU BEACH BEADY BEARD BEAST BEAUT BEECH BEEFY BEFIT BEGAN BEGAT BEGET' +
    'BEGIN BEGUN BEIGE BEING BELCH BELIE BELLE BELLY BELOW BENCH BERET BERRY BERTH BESET BETEL' +
    'BEVEL BEZEL BIBLE BICEP BIDDY BIGOT BILGE BILLY BINGE BINGO BIOME BIRCH BIRTH BISON BITTY' +
    'BLACK BLADE BLAME BLAND BLANK BLARE BLAST BLAZE BLEAK BLEAT BLEED BLEEP BLEND BLESS BLIMP' +
    'BLIND BLINK BLISS BLITZ BLOAT BLOCK BLOKE BLOND BLOOD BLOOM BLOWN BLUER BLUFF BLUNT BLURB' +
    'BLURT BLUSH BOARD BOAST BOBBY BONEY BONGO BONUS BOOBY BOOST BOOTH BOOTY BOOZE BOOZY BORAX' +
    'BORNE BOSOM BOSSY BOTCH BOUGH BOULE BOUND BOWEL BOXER BRACE BRAID BRAIN BRAKE BRAND BRASH' +
    'BRASS BRAVE BRAVO BRAWL BRAWN BREAD BREAK BREED BRIAR BRIBE BRICK BRIDE BRIEF BRINE BRING' +
    'BRINK BRINY BRISK BROAD BROIL BROKE BROOD BROOK BROOM BROTH BROWN BRUNT BRUSH BRUTE BUDDY' +
    'BUDGE BUGGY BUGLE BUILD BUILT BULGE BULKY BULLY BUMPY BUNCH BUNNY BURLY BURNT BURST BUSED' +
    'BUSHY BUTCH BUTTE BUXOM BUYER BYLAW CABAL CABBY CABIN CABLE CACAO CACHE CACTI CADDY CADET' +
    'CAGEY CAIRN CAMEL CAMEO CANAL CANDY CANNY CANOE CANON CAPER CAPON CAPUT CARAT CARGO CAROL' +
    'CAROM CARRY CARVE CASTE CATCH CATER CATTY CAULK CAUSE CAVIL CEASE CEDAR CELLO CHAFE CHAFF' +
    'CHAIN CHAIR CHALK CHAMP CHANT CHAOS CHARD CHARM CHART CHASE CHASM CHEAP CHEAT CHECK CHEEK' +
    'CHEER CHESS CHEST CHICK CHIDE CHIEF CHILD CHILI CHILL CHIME CHINA CHIRP CHOCK CHOIR CHOKE' +
    'CHORD CHORE CHOSE CHUCK CHUMP CHUNK CHURN CHUTE CIDER CIGAR CINCH CIRCA CIVIC CIVIL CLACK' +
    'CLAIM CLAMP CLANG CLANK CLASH CLASP CLASS CLEAN CLEAR CLEAT CLEFT CLERK CLICK CLIFF CLIMB' +
    'CLING CLINK CLOAK CLOCK CLONE CLOSE CLOTH CLOUD CLOUT CLOVE CLOWN CLUCK CLUED CLUMP CLUNG' +
    'CLUNK COACH COAST COBRA COCOA COLON COLOR COMET COMFY COMIC COMMA CONCH CONDO CONIC COPSE' +
    'CORAL CORER CORNY COUCH COUGH COULD COUNT COUPE COURT COVEN COVER COVET COVEY COWER COYLY' +
    'CRACK CRAFT CRAMP CRANE CRANK CRASH CRASS CRATE CRAVE CRAWL CRAZE CRAZY CREAK CREAM CREDO' +
    'CREED CREEK CREEP CREME CREPE CREPT CRESS CREST CRICK CRIED CRIER CRIME CRIMP CRISP CROAK' +
    'CROCK CRONE CRONY CROOK CROSS CROUP CROWD CROWN CRUDE CRUEL CRUMB CRUMP CRUSH CRUST CRYPT' +
    'CUBIC CUBIT CUMIN CURIO CURLY CURRY CURSE CURVE CURVY CUTIE CYBER CYCLE CYNIC DADDY DAILY' +
    'DAIRY DAISY DALLY DANCE DANDY DATUM DAUNT DEALT DEATH DEBAR DEBIT DEBUG DEBUT DECAL DECAY' +
    'DECOR DECOY DECRY DEFER DEIGN DEITY DELAY DELTA DELVE DEMON DEMUR DENIM DENSE DEPOT DEPTH' +
    'DERBY DETER DETOX DEUCE DEVIL DIARY DICEY DIGIT DILLY DIMLY DINER DINGO DINGY DIODE DIRGE' +
    'DIRTY DISCO DITCH DITTO DITTY DIVER DIVOT DIZZY DODGE DODGY DOGMA DOING DOLLY DONOR DONUT' +
    'DOPEY DOUBT DOUGH DOWDY DOWEL DOWNY DOWRY DOZEN DRAFT DRAIN DRAKE DRAMA DRANK DRAPE DRAWL' +
    'DRAWN DREAD DREAM DRECK DRESS DRIED DRIER DRIFT DRILL DRINK DRIVE DROIT DROLL DRONE DROOL' +
    'DROOP DROSS DROVE DROWN DRUID DRUNK DRYER DRYLY DUCHY DULLY DUMMY DUMPY DUNCE DUSKY DUSTY' +
    'DUTCH DUVET DWARF DWELL DWELT DYING EAGER EAGLE EARLY EARTH EASEL EATEN EATER EBONY ECLAT' +
    'EDICT EDIFY EERIE EGRET EIGHT EJECT EKING ELATE ELBOW ELDER ELECT ELEGY ELFIN ELIDE ELITE' +
    'ELOPE ELUDE EMAIL EMBED EMBER EMCEE EMOJI EMPTY ENACT ENDOW ENEMA ENEMY ENJOY ENNUI ENSUE' +
    'ENTER ENTRY ENVOY EPOCH EPOXY EQUAL EQUIP ERASE ERECT ERODE ERROR ERUPT ESSAY ESTER ETHER' +
    'ETHIC ETHOS ETUDE EVADE EVENT EVERY EVICT EVOKE EXACT EXALT EXCEL EXERT EXILE EXIST EXPEL' +
    'EXTOL EXTRA EXULT EYING FABLE FACET FAINT FAIRY FAITH FALSE FANCY FANNY FARCE FATAL FATTY' +
    'FAULT FAUNA FAVOR FEAST FECAL FEIGN FELLA FELON FEMME FEMUR FENCE FERAL FERRY FETAL FETCH' +
    'FETID FETUS FEVER FEWER FIBER FIBRE FICUS FIELD FIEND FIERY FIFTH FIFTY FIGHT FILER FILET' +
    'FILLY FILMY FILTH FINAL FINCH FINER FIRST FISHY FIXER FIZZY FJORD FLACK FLAIL FLAIR FLAKE' +
    'FLAKY FLAME FLANK FLARE FLASH FLASK FLECK FLEET FLESH FLICK FLIER FLING FLINT FLIRT FLOAT' +
    'FLOCK FLOOD FLOOR FLORA FLOSS FLOUR FLOUT FLOWN FLUFF FLUID FLUKE FLUME FLUNG FLUNK FLUSH' +
    'FLUTE FLYER FOAMY FOCAL FOCUS FOGGY FOIST FOLIO FOLLY FORAY FORCE FORGE FORGO FORTE FORTH' +
    'FORTY FORUM FOUND FOYER FRAIL FRAME FRANK FRAUD FREAK FREED FREER FRESH FRIAR FRIED FRILL' +
    'FRISK FRITZ FROCK FROND FRONT FROST FROTH FROWN FROZE FRUIT FUDGE FUGUE FULLY FUNGI FUNKY' +
    'FUNNY FUROR FURRY FUSSY FUZZY GAFFE GAILY GAMER GAMMA GAMUT GASSY GAUDY GAUGE GAUNT GAUZE' +
    'GAVEL GAWKY GAYER GAYLY GAZER GECKO GEEKY GEESE GENIE GENRE GEODE GHOST GHOUL GIANT GIDDY' +
    'GIPSY GIRLY GIRTH GIVEN GIVER GLADE GLAND GLARE GLASS GLAZE GLEAM GLEAN GLIDE GLINT GLOAT' +
    'GLOBE GLOOM GLORY GLOSS GLOVE GLYPH GNASH GNOME GODLY GOING GOLEM GOLLY GONAD GONER GOODY' +
    'GOOEY GOOFY GOOSE GORGE GOUGE GOURD GRACE GRADE GRAFT GRAIL GRAIN GRAND GRANT GRAPE GRAPH' +
    'GRASP GRASS GRATE GRAVE GRAVY GRAZE GREAT GREED GREEN GREET GRIEF GRILL GRIME GRIMY GRIND' +
    'GRIPE GRIST GROAN GROIN GROOM GROPE GROSS GROUP GROUT GROVE GROWL GROWN GRUEL GRUFF GRUNT' +
    'GUANO GUARD GUAVA GUESS GUEST GUIDE GUILD GUILE GUILT GUISE GULCH GULLY GUMBO GUMMY GUPPY' +
    'GUSTO GUSTY GYPSY HABIT HAIRY HALVE HANDY HAPPY HARDY HAREM HARPY HARRY HARSH HASTE HASTY' +
    'HATCH HATER HAUNT HAUTE HAVEN HAVOC HAZEL HEADY HEARD HEART HEATH HEAVE HEAVY HEDGE HEFTY' +
    'HEIST HELIX HELLO HENCE HERON HILLY HINGE HIPPO HIPPY HITCH HOARD HOBBY HOIST HOLEY HOLLY' +
    'HOMER HONEY HONOR HORDE HORNY HORSE HOTEL HOTLY HOUND HOUSE HOVEL HOVER HOWDY HUMAN HUMID' +
    'HUMOR HUMPH HUMUS HUNCH HUNKY HURRY HUSKY HUSSY HUTCH HYDRO HYENA HYMEN HYPER ICILY ICING' +
    'IDEAL IDIOM IDIOT IDLER IDYLL IGLOO ILIAC IMAGE IMBUE IMPEL IMPLY INANE INBOX INCUR INDEX' +
    'INDIE INEPT INERT INFER INGOT INLAY INLET INNER INPUT INTEL INTER INTRO IONIC IRATE IRONY' +
    'ISLET ISSUE ITCHY IVORY JAUNT JAZZY JELLY JERKY JETTY JEWEL JIFFY JOINT JOIST JOKER JOLLY' +
    'JOUST JUDGE JUICE JUICY JUMBO JUMPY JUNTA JUNTO JUROR KAPPA KARAT KARMA KAYAK KAZOO KEBAB' +
    'KHAKI KINKY KIOSK KITTY KNACK KNAVE KNEAD KNEED KNEEL KNELT KNIFE KNOCK KNOLL KNOWN KOALA' +
    'KRILL LABEL LABOR LADEN LADLE LAGER LANCE LANKY LAPEL LAPSE LARGE LARVA LASER LASSO LATCH' +
    'LATER LATHE LATTE LAUGH LAYER LEACH LEAFY LEAKY LEANT LEAPT LEARN LEASE LEASH LEAST LEAVE' +
    'LEDGE LEECH LEERY LEFTY LEGAL LEGGY LEMON LEMUR LEPER LEVEL LEVER LIBEL LIEGE LIGHT LIKEN' +
    'LILAC LIMBO LIMIT LINEN LINER LINGO LIPID LITHE LIVEN LIVER LIVID LLAMA LOAMY LOATH LOBBY' +
    'LOCAL LOCUS LODGE LOFTY LOGIC LOGIN LOOPY LOOSE LORIS LORRY LOSER LOUSE LOUSY LOVER LOWER' +
    'LOWLY LOYAL LUCID LUCKY LUMEN LUMPY LUNAR LUNCH LUNGE LUPUS LURCH LURID LUSTY LYING LYMPH' +
    'LYNCH LYRIC MACAW MACHO MACRO MADAM MADLY MAFIA MAGIC MAGMA MAIZE MAJOR MAKER MAMBO MAMMA' +
    'MAMMY MANGA MANGE MANGO MANGY MANIA MANIC MANLY MANOR MAPLE MARCH MARRY MARSH MASON MASSE' +
    'MATCH MATEY MAUVE MAVEN MAXIM MAYBE MAYOR MEALY MEANT MEATY MECCA MEDAL MEDIA MEDIC MELEE' +
    'MELON MERCY MERGE MERIT MERRY MESSY METAL METER METRO MICRO MIDGE MIDST MIGHT MILKY MIMIC' +
    'MINCE MINER MINIM MINOR MINTY MINUS MIRTH MISER MISSY MOCHA MODAL MODEL MODEM MOGUL MOIST' +
    'MOLAR MOLDY MOMMY MONEY MONTH MOODY MOOSE MORAL MORON MORPH MOSSY MOTEL MOTIF MOTOR MOTTO' +
    'MOULT MOUND MOUNT MOURN MOUSE MOUTH MOVER MOVIE MOWER MUCKY MUCUS MUDDY MULCH MUMMY MUNCH' +
    'MURAL MURKY MUSHY MUSIC MUSKY MUSTY MYRRH NADIR NAIVE NANNY NASAL NASTY NATAL NAVAL NAVEL' +
    'NEEDY NEIGH NERDY NERVE NERVY NEVER NEWER NEWLY NICER NICHE NIECE NIFTY NIGHT NINJA NINNY' +
    'NINTH NOBLE NOBLY NOISE NOISY NOMAD NOOSE NORTH NOSEY NOTCH NOVEL NUDGE NURSE NUTTY NYLON' +
    'NYMPH OAKEN OASIS OBESE OCCUR OCEAN OCTAL OCTET ODDER ODDLY OFFAL OFFER OFTEN OLDEN OLDER' +
    'OLIVE OMBRE OMEGA ONION ONSET OPERA OPINE OPIUM OPTIC ORBIT ORDER ORGAN OTHER OTTER OUGHT' +
    'OUNCE OUTDO OUTER OUTGO OVARY OVATE OVERT OVINE OVOID OWING OWNER OXIDE OZONE PADDY PAGAN' +
    'PAGER PAINT PALER PALSY PANEL PANIC PANSY PAPAL PAPER PARCH PARER PARKA PARRY PARSE PARTY' +
    'PASTA PASTE PASTY PATCH PATIO PATSY PATTY PAUSE PAYEE PAYER PEACE PEACH PEARL PECAN PEDAL' +
    'PEEVE PENAL PENCE PENNE PENNY PERCH PERIL PERKY PESKY PESTO PETAL PETTY PHASE PHONE PHONY' +
    'PHOTO PIANO PICKY PIECE PIETY PIGGY PILOT PINCH PINEY PINKY PINTO PIOUS PIPER PIQUE PITCH' +
    'PITHY PIVOT PIXEL PIXIE PIZZA PLACE PLAID PLAIN PLAIT PLANE PLANK PLANT PLATE PLAZA PLEAD' +
    'PLEAT PLIED PLIER PLUCK PLUMB PLUME PLUMP PLUNK PLUSH POESY POINT POISE POKER POLAR POLKA' +
    'POLYP POOCH POPPY PORCH POSER POSIT POSSE POUCH POUND POUTY POWER PRANK PRATE PRAWN PREEN' +
    'PRESS PRICE PRICK PRIDE PRIED PRIME PRIMO PRINT PRIOR PRISM PRIVY PRIZE PROBE PRONE PRONG' +
    'PROOF PROSE PROUD PROVE PROWL PROXY PRUDE PRUNE PSALM PSHAW PSYCH PUBIC PUDGY PUFFY PULPY' +
    'PULSE PUNCH PUPAL PUPIL PUPPY PUREE PURER PURGE PURSE PUSHY PUTTY PYGMY QUACK QUAIL QUAKE' +
    'QUALM QUARK QUART QUASH QUASI QUEEN QUEER QUELL QUERY QUEST QUEUE QUICK QUIET QUILL QUILT' +
    'QUIRK QUITE QUOTA QUOTE QUOTH RABBI RABID RACER RADAR RADII RADIO RAINY RAISE RAJAH RALLY' +
    'RALPH RAMEN RANCH RANDY RANGE RAPID RARER RASPY RATIO RATTY RAVEN RAYON RAZOR REACH REACT' +
    'READY REALM REARM REBAR REBEL REBUS REBUT RECAP RECUR RECUT REEDY REFER REFIT REGAL REHAB' +
    'REIGN RELAX RELAY RELIC REMIT REMIX RENAL RENEW REPAY REPEL REPLY RERUN RESET RESIN RETCH' +
    'RETRO RETRY REUSE REVEL REVUE RHINO RHYME RIDER RIDGE RIFLE RIGHT RIGID RIGOR RINSE RIPEN' +
    'RIPER RISEN RISER RISKY RITZY RIVAL RIVER RIVET ROACH ROAST ROBIN ROBOT ROCKY RODEO ROGER' +
    'ROGUE ROOMY ROOST ROTOR ROUGE ROUGH ROUND ROUSE ROUTE ROVER ROWDY ROWER ROYAL RUDDY RUDER' +
    'RUGBY RULER RUMBA RUMOR RUNNY RUPEE RURAL RUSTY SADLY SAFER SAINT SALAD SALLY SALON SALSA' +
    'SALTY SALVE SALVO SANDY SANER SAPPY SASSY SATIN SATYR SAUCE SAUCY SAUNA SAUTE SAVOR SAVOY' +
    'SAVVY SCALD SCALE SCALP SCALY SCAMP SCANT SCARE SCARF SCARY SCENE SCENT SCION SCOFF SCOLD' +
    'SCONE SCOOP SCOOT SCOPE SCORE SCORN SCOUR SCOUT SCOWL SCRAM SCRAP SCREE SCREW SCRUB SCRUM' +
    'SCUBA SEDAN SEEDY SEGUE SEIZE SEMEN SENSE SEPIA SERIF SERUM SERVE SETUP SEVEN SEVER SEWER' +
    'SHACK SHADE SHADY SHAFT SHAKE SHAKY SHALE SHALL SHALT SHAME SHANK SHAPE SHARD SHARE SHARK' +
    'SHARP SHAVE SHAWL SHEAR SHEEN SHEEP SHEER SHEET SHEIK SHELF SHELL SHIED SHIFT SHILL SHINE' +
    'SHINY SHIRE SHIRK SHIRT SHOAL SHOCK SHONE SHOOK SHOOT SHORE SHORN SHORT SHOUT SHOVE SHOWN' +
    'SHOWY SHREW SHRUB SHRUG SHUCK SHUNT SHUSH SHYLY SIEGE SIEVE SIGHT SIGMA SILKY SILLY SINCE' +
    'SINEW SINGE SIREN SISSY SIXTH SIXTY SKATE SKIER SKIFF SKILL SKIMP SKIRT SKULK SKULL SKUNK' +
    'SLACK SLAIN SLANG SLANT SLASH SLATE SLAVE SLEEK SLEEP SLEET SLEPT SLICE SLICK SLIDE SLIME' +
    'SLIMY SLING SLINK SLOOP SLOPE SLOSH SLOTH SLUMP SLUNG SLUNK SLURP SLUSH SLYLY SMACK SMALL' +
    'SMART SMASH SMEAR SMELL SMELT SMILE SMIRK SMITE SMITH SMOCK SMOKE SMOKY SMOTE SNACK SNAFU' +
    'SNAIL SNAKE SNAKY SNARE SNARL SNEAK SNEER SNIDE SNIFF SNIPE SNOOP SNORE SNORT SNOUT SNOWY' +
    'SNUCK SNUFF SOAPY SOBER SOGGY SOLAR SOLID SOLVE SONAR SONIC SOOTH SOOTY SORRY SOUND SOUPY' +
    'SOUTH SOWER SPACE SPADE SPANK SPARE SPARK SPASM SPAWN SPEAK SPEAR SPECK SPEED SPELL SPELT' +
    'SPEND SPENT SPERM SPICE SPICY SPIED SPIEL SPIKE SPIKY SPILL SPILT SPINE SPINY SPIRE SPITE' +
    'SPLAT SPLIT SPOIL SPOKE SPOOF SPOOK SPOOL SPOON SPORE SPORT SPOUT SPRAY SPREE SPRIG SPUNK' +
    'SPURN SPURT SQUAD SQUAT SQUIB STACK STAFF STAGE STAID STAIN STAIR STAKE STALE STALK STALL' +
    'STAMP STAND STANK STARE STARK START STASH STATE STAVE STEAD STEAK STEAL STEAM STEED STEEL' +
    'STEEP STEER STEIN STERN STICK STIFF STILL STILT STING STINK STINT STOCK STOIC STOKE STOLE' +
    'STOMP STONE STONY STOOD STOOL STOOP STORE STORK STORM STORY STOUT STOVE STRAP STRAW STRAY' +
    'STREW STRIP STRUT STUCK STUDY STUFF STUMP STUNG STUNK STUNT STYLE SUAVE SUGAR SUING SUITE' +
    'SULKY SULLY SUMAC SUNNY SUPER SURER SURGE SURLY SUSHI SWAMI SWAMP SWARM SWASH SWATH SWEAR' +
    'SWEAT SWEEP SWEET SWELL SWEPT SWIFT SWILL SWINE SWING SWIRL SWISH SWOON SWOOP SWORD SWORE' +
    'SWORN SWUNG SYNOD SYRUP TABBY TABLE TABOO TACIT TACKY TAFFY TAINT TAKEN TAKER TALLY TALON' +
    'TAMER TANGO TANGY TAPER TAPIR TARDY TAROT TASTE TASTY TATTY TAUNT TAWNY TEACH TEARY TEASE' +
    'TEDDY TEETH TEMPO TENET TENOR TENSE TENTH TEPEE TEPID TERRA TERSE TESTY THANK THEFT THEIR' +
    'THEME THERE THESE THETA THICK THIEF THIGH THING THINK THIRD THONG THORN THOSE THREE THREW' +
    'THROB THROW THRUM THUMB THUMP THYME TIARA TIBIA TIDAL TIGER TIGHT TILDE TIMER TIMID TIPSY' +
    'TITAN TITHE TITLE TOADY TOAST TODAY TODDY TOKEN TONAL TONGA TONIC TOOTH TOPAZ TOPIC TORCH' +
    'TORSO TORUS TOTAL TOTEM TOUCH TOUGH TOWEL TOWER TOXIC TOXIN TRACE TRACK TRACT TRADE TRAIL' +
    'TRAIN TRAIT TRAMP TRASH TRAWL TREAD TREAT TREND TRIAD TRIAL TRIBE TRICE TRICK TRIED TRILL' +
    'TRIPE TRITE TROLL TROOP TROPE TROUT TROVE TRUCE TRUCK TRUER TRULY TRUMP TRUNK TRUSS TRUST' +
    'TRUTH TRYST TUBAL TUBER TULIP TULLE TUMOR TUNIC TURBO TUTOR TWANG TWEAK TWEED TWEEN TWEET' +
    'TWICE TWINE TWIRL TWIST TWIXT TYING UDDER ULCER ULTRA UMBRA UNCAP UNCLE UNCUT UNDER UNDID' +
    'UNDUE UNFED UNFIT UNIFY UNION UNITE UNITY UNLIT UNMET UNSET UNTIE UNTIL UNWED UNZIP UPPER' +
    'UPSET URBAN URINE USAGE USHER USING USUAL USURP USURY UTILE UTTER UVULA VAGUE VALET VALID' +
    'VALOR VALUE VALVE VAPID VAPOR VAULT VAUNT VEGAN VENOM VENUE VERGE VERSE VERSO VERVE VICAR' +
    'VIDEO VIGIL VIGOR VILLA VINYL VIOLA VIPER VIRAL VIRUS VISIT VISOR VISTA VITAL VIVID VIXEN' +
    'VOCAL VODKA VOGUE VOICE VOILA VOMIT VOTER VOUCH VOWEL VYING WACKY WAFER WAGER WAGON WAIST' +
    'WAIVE WAKEN WALTZ WARTY WASTE WATCH WATER WAVER WAXEN WEARY WEAVE WEDGE WEEDY WEIGH WEIRD' +
    'WELCH WELSH WENCH WHACK WHALE WHARF WHEAT WHEEL WHELP WHERE WHICH WHIFF WHILE WHINE WHINY' +
    'WHIRL WHISK WHITE WHOLE WHOOP WHOSE WIDEN WIDER WIDOW WIDTH WIELD WIGHT WILLY WIMPY WINCE' +
    'WINCH WINDY WISER WISPY WITCH WITTY WOKEN WOMAN WOMEN WOODY WOOER WOOLY WOOZY WORDY WORLD' +
    'WORRY WORSE WORST WORTH WOULD WOUND WOVEN WRACK WRATH WREAK WRECK WREST WRING WRIST WRITE' +
    'WRONG WROTE WRUNG WRYLY YACHT YAHOO YEARN YEAST YIELD YODEL YOUNG YOUTH ZEBRA ZESTY ZONAL';

  var ALL_WORDLE_WORDS = WORDLE_VALID_WORDS_RAW.split(/\s+/);
  var WORDLE_DICTIONARY_SET = new Set(ALL_WORDLE_WORDS);
  for (var _bw = 0; _bw < BB_WORDLE_WORDS.length; _bw++) {
    WORDLE_DICTIONARY_SET.add(BB_WORDLE_WORDS[_bw]);
  }

  /**
   * Validates whether a 5-letter word exists in the authentic Wordle dictionary.
   */
  function isValidWordleWord(word) {
    if (!word || typeof word !== 'string' || word.length !== 5) return false;
    return WORDLE_DICTIONARY_SET.has(word.toUpperCase());
  }

  /**
   * Displays an authentic floating warning pill / toast above the Wordle board.
   */
  function showWordleToast(message, durationMs) {
    if (typeof document === 'undefined') return;
    var wrapper = document.querySelector('.wordle-board-wrapper') || document.querySelector('.wordle-card');
    if (!wrapper) return;

    var existing = wrapper.querySelector('.wordle-toast-container');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    var container = document.createElement('div');
    container.className = 'wordle-toast-container';
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'assertive');

    var toast = document.createElement('div');
    toast.className = 'wordle-toast';
    toast.textContent = message;

    container.appendChild(toast);
    wrapper.appendChild(container);

    var dur = durationMs || 1500;
    setTimeout(function() {
      toast.classList.add('fade-out');
      setTimeout(function() {
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, 250);
    }, dur);
  }


  // ── Educational BB Trivia Question Bank ──────────────────────────────────
  var BB_TRIVIA_QUESTIONS = [
    {
      q: 'What is the official Motto of The Boys\' Brigade?',
      options: ['Sure & Stedfast', 'Be Prepared', 'Faith & Courage', 'Duty First'],
      correct: 0,
      expl: 'The BB Motto is "Sure & Stedfast", taken from Hebrews 6:19: "Which hope we have as an anchor of the soul, both sure and stedfast".'
    },
    {
      q: 'Who was the Founder of The Boys\' Brigade?',
      options: ['Lord Baden-Powell', 'Sir William Alexander Smith', 'Alexander MacKeith', 'John Shearer'],
      correct: 1,
      expl: 'Sir William Alexander Smith founded The Boys\' Brigade on 4th October 1883 in Glasgow, Scotland.'
    },
    {
      q: 'In what year was 1st Petaling Jaya Boys\' Brigade Company founded?',
      options: ['1954', '1961', '1975', '1983'],
      correct: 1,
      expl: '1st Petaling Jaya Company was founded in 1961 and is sponsored by Trinity Methodist Church PJ.'
    },
    {
      q: 'What is the primary twin pillar foundation of The Boys\' Brigade methodology?',
      options: ['Religion and Discipline', 'Athletics and Academics', 'Camping and Survival', 'Music and Drill'],
      correct: 0,
      expl: 'The twin pillars of The Boys\' Brigade are Religion and Discipline, designed to promote habits of obedience, reverence, discipline, and self-respect.'
    },
    {
      q: 'What is the highest award a Senior Section BB member can achieve in Malaysia?',
      options: ['President\'s Award', 'Founder\'s Badge', 'Gold Badge', 'Chief Leader Cross'],
      correct: 1,
      expl: 'The Founder\'s Award is the highest national award in the BB Malaysia Senior Section.'
    },
    {
      q: 'In Foot Drill, what is the command to stand at attention in Malay?',
      options: ['Senang Diri', 'Sedia', 'Rehatkan Diri', 'Ke Kanan Lurus'],
      correct: 1,
      expl: '"Skuad, Sedia!" is the official command for coming to the position of Attention.'
    },
    {
      q: 'What minimum attendance percentage is required across the year for the One Year Service milestone badge?',
      options: ['70%', '75%', '80%', '90%'],
      correct: 2,
      expl: 'A member must attain at least 80% attendance throughout the service year to qualify for the One Year Service milestone badge.'
    },
    {
      q: 'What drill command orders a squad to salute to the front?',
      options: ['Hormat ke hadapan, Hormat', 'Ke kanan pusing', 'Cepat jalan', 'Buka barisan'],
      correct: 0,
      expl: '"Hormat ke hadapan, Hormat" instructs the squad to deliver a standard salute to the front.'
    },
    {
      q: 'What emblem is at the center of The Boys\' Brigade crest?',
      options: ['A Lion', 'An Anchor and Cross', 'A Shield and Spear', 'A Fleur-de-lis'],
      correct: 1,
      expl: 'The BB emblem features an Anchor (symbolizing Christian hope) with the Cross integrated at its center.'
    },
    {
      q: 'What are the two regular parade sections for youth members in 1st PJ?',
      options: ['Junior Section & Senior Section', 'Cadet Section & Scout Section', 'Alpha & Zulu', 'Rookies & Veterans'],
      correct: 0,
      expl: '1st PJ runs Pre-Junior / Junior Section (primary school) and Senior Section (secondary school).'
    },
    {
      q: 'What drill command is given to dress a squad in straight lines?',
      options: ['Pandang Depan', 'Ke Kanan Lurus', 'Tutup Barisan', 'Langkah Ke Sebelah'],
      correct: 1,
      expl: '"Ke Kanan Lurus!" instructs squad members to turn heads right and dress ranks with the right marker.'
    },
    {
      q: 'Which scripture passage provides the inspiration for the BB Motto?',
      options: ['John 3:16', 'Hebrews 6:19', 'Philippians 4:13', 'Psalm 23:1'],
      correct: 1,
      expl: 'Hebrews 6:19: "Which hope we have as an anchor of the soul, both sure and stedfast..."'
    },
    {
      q: 'Which city and country was The Boys\' Brigade originally founded in?',
      options: ['Glasgow, Scotland', 'London, England', 'Edinburgh, Scotland', 'Dublin, Ireland'],
      correct: 0,
      expl: 'The Boys\' Brigade was founded on 4th October 1883 at North Woodside Mission Hall in Glasgow, Scotland.'
    },
    {
      q: 'What is the Object of The Boys\' Brigade?',
      options: ['The advancement of Christ\'s Kingdom among Boys', 'To explore nature and wilderness', 'To teach military tactics', 'To achieve academic excellence'],
      correct: 0,
      expl: 'The Object is "The advancement of Christ\'s Kingdom among Boys and the promotion of habits of Obedience, Reverence, Discipline, Self-Respect and all that tends towards a true Christian manliness."'
    },
    {
      q: 'What is the non-commissioned officer (NCO) rank immediately above Lance Corporal?',
      options: ['Corporal', 'Sergeant', 'Staff Sergeant', 'Warrant Officer'],
      correct: 0,
      expl: 'In the Senior Section, a Lance Corporal is promoted to Corporal, and then to Sergeant.'
    },
    {
      q: 'What is the traditional colour of the Senior Section BB uniform shirt in Malaysia?',
      options: ['Royal Blue', 'Khaki', 'White', 'Navy Black'],
      correct: 0,
      expl: 'Senior Section members wear the regulation Royal Blue short-sleeved uniform shirt.'
    },
    {
      q: 'In Foot Drill, what is the command to dismiss a parade?',
      options: ['Keluar Baris', 'Bersurai', 'Cepat Jalan', 'Berhenti'],
      correct: 1,
      expl: '"Bersurai" is given when the parade has concluded for the day and members are dismissed from duty.'
    },
    {
      q: 'What is the title of the Officer who leads and commands the entire BB Company?',
      options: ['Captain', 'Lieutenant', 'Chaplain', 'Instructor'],
      correct: 0,
      expl: 'The Captain is the designated Officer in charge who leads and administers the Company.'
    },
    {
      q: 'Which biennial national BB event brings Companies across Malaysia together for friendly competitions?',
      options: ['National Pesta', 'Jamboree', 'BB Expo', 'Camporee'],
      correct: 0,
      expl: 'The National Pesta is BB Malaysia\'s biennial national gathering featuring national drill, band, and sports competitions.'
    },
    {
      q: 'What is the BB hymn traditionally sung at Company opening parade?',
      options: ['Will Your Anchor Hold', 'Amazing Grace', 'Onward Christian Soldiers', 'How Great Thou Art'],
      correct: 0,
      expl: '"Will Your Anchor Hold" (The Anchor Song, written by Priscilla J. Owens) is the official hymn of The Boys\' Brigade.'
    }
  ];

  // ── Internal State ────────────────────────────────────────────────────────
  var _arcadeSubtab = 'wordle'; // 'wordle' | 'trivia' | 'stats'
  var _wordleState = {
    word: '',
    guesses: [],
    currentGuess: '',
    isGameOver: false,
    hasWon: false,
    maxTries: 6,
    dateKey: ''
  };

  var _triviaState = {
    dateKey: '',
    questionIndices: [],
    answers: {},
    currentIndex: 0,
    isSubmitted: false,
    score: 0,
    submittedAt: null
  };

  // ── Date & Daily Key Helpers ──────────────────────────────────────────────
  function getTodayDateKey(ref) {
    var now;
    if (ref instanceof Date) {
      now = ref;
    } else if (typeof ref === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ref)) {
      var parts = ref.split('-');
      now = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      now = new Date();
    }
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function getYesterdayDateKey(ref) {
    var base;
    if (ref instanceof Date) {
      base = ref;
    } else if (typeof ref === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ref)) {
      var parts = ref.split('-');
      base = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      base = new Date();
    }
    var prev = new Date(base.getTime() - 86400000);
    var y = prev.getFullYear();
    var m = String(prev.getMonth() + 1).padStart(2, '0');
    var d = String(prev.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function getDailyWordleWord(dateKey) {
    var key = dateKey || getTodayDateKey();
    var seed = 0;
    for (var i = 0; i < key.length; i++) {
      seed = (seed * 31 + key.charCodeAt(i)) % 2147483647;
    }
    var index = Math.abs(seed) % ALL_WORDLE_WORDS.length;
    return ALL_WORDLE_WORDS[index];
  }

  // ── Credits & Streak Storage Engine ───────────────────────────────────────
  function getArcadeUserKey() {
    var ic = (typeof sessionGet === 'function') ? (sessionGet('ic') || sessionGet('email')) : null;
    return ic ? ('bb_arcade_' + String(ic).replace(/[^a-zA-Z0-9_-]/g, '_')) : 'bb_arcade_guest';
  }

  function getArcadeStats(refDate) {
    var defaultStats = {
      credits: 0,
      streak: 0,
      bestStreak: 0,
      lastPlayedDate: null,
      wordlePlays: 0,
      wordleWins: 0,
      triviaPlays: 0,
      triviaScoreTotal: 0
    };

    try {
      var key = getArcadeUserKey();
      var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(key) : null;
      if (raw) {
        var parsed = JSON.parse(raw);
        // Verify streak freshness: if last played before yesterday, streak resets to 0 until played today
        var today = (typeof refDate === 'string' && refDate) ? getTodayDateKey(refDate) : getTodayDateKey();
        var yesterday = getYesterdayDateKey(today);
        if (parsed.lastPlayedDate && parsed.lastPlayedDate !== today && parsed.lastPlayedDate !== yesterday) {
          parsed.streak = 0;
        }
        return Object.assign({}, defaultStats, parsed);
      }
    } catch (e) {
      console.warn('getArcadeStats error:', e);
    }
    return defaultStats;
  }

  function saveArcadeStats(stats) {
    try {
      var key = getArcadeUserKey();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(stats));
      }
      if (typeof sessionSet === 'function') {
        sessionSet('game_streak', String(stats.streak || 0));
        sessionSet('game_credits', String(stats.credits || 0));
      }
      updateArcadeHeaderBadge(stats);

      // Async sync to Supabase bb_config if logged in
      var ic = (typeof sessionGet === 'function') ? (sessionGet('ic') || sessionGet('email')) : null;
      if (ic) {
        var client = getArcadeSupaClient();
        if (client) {
          if (typeof client.upsert === 'function') {
            client.upsert('bb_config', { key: key, value: JSON.stringify(stats) }, 'key').catch(function() {});
          } else if (typeof client.safeConfigUpdate === 'function') {
            client.safeConfigUpdate(key, stats).catch(function() {});
          }
        }
      }
    } catch (e) {
      console.warn('saveArcadeStats error:', e);
    }
  }

  function getArcadeSupaClient() {
    if (typeof window !== 'undefined' && typeof window.getSupaClient === 'function') return window.getSupaClient();
    if (typeof window !== 'undefined' && window.supa) return window.supa;
    if (typeof global !== 'undefined' && global.supa) return global.supa;
    if (typeof supa !== 'undefined' && supa) return supa;
    return null;
  }

  /**
   * Fetches remote arcade stats from Supabase bb_config and non-destructively merges
   * with local storage to preserve streak and credits across multiple devices.
   */
  async function fetchRemoteArcadeStats(optRefDate) {
    var key = getArcadeUserKey();
    if (!key || key === 'bb_arcade_guest') return getArcadeStats(optRefDate);

    var client = getArcadeSupaClient();
    if (!client) return getArcadeStats(optRefDate);

    var local = getArcadeStats(optRefDate);

    try {
      var rows = null;
      if (typeof client.get === 'function') {
        rows = await client.get('bb_config?key=eq.' + encodeURIComponent(key) + '&select=value');
      } else if (typeof client.getConfig === 'function') {
        var cfgVal = await client.getConfig(key);
        if (cfgVal) rows = [{ value: cfgVal }];
      }

      if (rows && rows.length && rows[0].value) {
        var remote = (typeof rows[0].value === 'string') ? JSON.parse(rows[0].value) : rows[0].value;
        if (remote && typeof remote === 'object') {
          var today = (typeof optRefDate === 'string' && optRefDate) ? getTodayDateKey(optRefDate) : getTodayDateKey();
          var yesterday = getYesterdayDateKey(today);

          var merged = {
            credits: Math.max(Number(local.credits) || 0, Number(remote.credits) || 0),
            bestStreak: Math.max(Number(local.bestStreak) || 0, Number(remote.bestStreak) || 0),
            wordlePlays: Math.max(Number(local.wordlePlays) || 0, Number(remote.wordlePlays) || 0),
            wordleWins: Math.max(Number(local.wordleWins) || 0, Number(remote.wordleWins) || 0),
            triviaPlays: Math.max(Number(local.triviaPlays) || 0, Number(remote.triviaPlays) || 0),
            triviaScoreTotal: Math.max(Number(local.triviaScoreTotal) || 0, Number(remote.triviaScoreTotal) || 0),
            lastPlayedDate: remote.lastPlayedDate || local.lastPlayedDate || null,
            streak: Math.max(Number(local.streak) || 0, Number(remote.streak) || 0)
          };

          if (merged.lastPlayedDate && merged.lastPlayedDate !== today && merged.lastPlayedDate !== yesterday) {
            merged.streak = 0;
          }

          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(key, JSON.stringify(merged));
          }
          if (typeof sessionSet === 'function') {
            sessionSet('game_streak', String(merged.streak || 0));
            sessionSet('game_credits', String(merged.credits || 0));
          }
          updateArcadeHeaderBadge(merged);

          if ((Number(local.credits) || 0) > (Number(remote.credits) || 0) || (Number(local.streak) || 0) > (Number(remote.streak) || 0)) {
            if (typeof client.upsert === 'function') {
              client.upsert('bb_config', { key: key, value: JSON.stringify(merged) }, 'key').catch(function() {});
            }
          }

          return merged;
        }
      } else {
        if (local && (local.credits > 0 || local.streak > 0)) {
          if (typeof client.upsert === 'function') {
            client.upsert('bb_config', { key: key, value: JSON.stringify(local) }, 'key').catch(function() {});
          }
        }
      }
    } catch (e) {
      console.warn('fetchRemoteArcadeStats error:', e);
    }

    return local;
  }

  /**
   * Records game participation for either Wordle or Trivia.
   * Increments the daily streak if not already played today.
   * Maintains/resets streak if missed.
   */
  function recordGameParticipation(gameOrDate, optDate) {
    var overrideDate = null;
    if (typeof optDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(optDate)) {
      overrideDate = optDate;
    } else if (typeof gameOrDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(gameOrDate)) {
      overrideDate = gameOrDate;
    }

    var stats = getArcadeStats(overrideDate);
    var today = overrideDate ? getTodayDateKey(overrideDate) : getTodayDateKey();
    var yesterday = getYesterdayDateKey(today);

    if (stats.lastPlayedDate === today) {
      // Already participated today; streak preserved
      return stats;
    }

    if (stats.lastPlayedDate === yesterday) {
      // Participated yesterday; increment streak!
      stats.streak = (stats.streak || 0) + 1;
    } else {
      // Missed at least one day or first time playing; streak set to 1
      stats.streak = 1;
    }

    if (stats.streak > (stats.bestStreak || 0)) {
      stats.bestStreak = stats.streak;
    }

    stats.lastPlayedDate = today;
    saveArcadeStats(stats);
    return stats;
  }

  /**
   * Awards game credits to the member.
   */
  function awardCredits(amount, reason) {
    if (!amount || amount <= 0) return (getArcadeStats().credits || 0);
    var stats = getArcadeStats();
    stats.credits = (stats.credits || 0) + amount;
    saveArcadeStats(stats);

    if (typeof showToast === 'function') {
      showToast('+' + amount + ' Credits earned! ' + (reason ? '(' + reason + ')' : ''), 'success', 3500);
    }
    return stats.credits;
  }

  function updateArcadeHeaderBadge(stats) {
    if (typeof document === 'undefined') return;
    var data = stats || getArcadeStats();
    var streakValEl = document.querySelector('.nav-streak-val');
    var credsValEl = document.getElementById('nav-points-val');
    var badgeEl = document.getElementById('nav-points-badge');

    if (streakValEl) streakValEl.textContent = String(data.streak || 0);
    if (credsValEl) credsValEl.textContent = String(data.credits || 0);
    if (badgeEl) {
      badgeEl.title = 'Daily Streak: ' + (data.streak || 0) + ' days | Total Credits: ' + (data.credits || 0) + ' (Click for 1stPJ Arcade)';
      badgeEl.setAttribute('aria-label', 'Credits: ' + (data.credits || 0) + ', Streak: ' + (data.streak || 0));
    }
  }

  // ── Wordle Game Engine ───────────────────────────────────────────────────
  function initWordle() {
    var today = getTodayDateKey();
    var targetWord = getDailyWordleWord(today).toUpperCase();
    var userKey = getArcadeUserKey();
    var storageKey = 'bb_wordle_' + today + '_' + userKey;

    var saved = null;
    try {
      var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(storageKey) : null;
      if (raw) saved = JSON.parse(raw);
    } catch (e) {}

    if (saved && saved.dateKey === today) {
      _wordleState = saved;
    } else {
      _wordleState = {
        word: targetWord,
        guesses: [],
        currentGuess: '',
        isGameOver: false,
        hasWon: false,
        maxTries: 6,
        dateKey: today
      };
    }

    renderWordleView();
  }

  function saveWordleState() {
    try {
      var userKey = getArcadeUserKey();
      var storageKey = 'bb_wordle_' + _wordleState.dateKey + '_' + userKey;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(_wordleState));
      }
    } catch (e) {}
  }

  function evaluateGuess(guess, target) {
    var result = ['absent', 'absent', 'absent', 'absent', 'absent'];
    var targetLetters = target.split('');
    var guessLetters = guess.split('');

    // First pass: exact matches (green / correct)
    for (var i = 0; i < 5; i++) {
      if (guessLetters[i] === targetLetters[i]) {
        result[i] = 'correct';
        targetLetters[i] = null;
        guessLetters[i] = null;
      }
    }

    // Second pass: letter present in different position (gold / present)
    for (var j = 0; j < 5; j++) {
      if (guessLetters[j] !== null) {
        var foundIndex = targetLetters.indexOf(guessLetters[j]);
        if (foundIndex !== -1) {
          result[j] = 'present';
          targetLetters[foundIndex] = null;
        }
      }
    }

    return result;
  }

  function handleWordleKey(char) {
    if (_wordleState.isGameOver) return;
    var c = String(char || '').toUpperCase();

    if (c === 'ENTER') {
      submitWordleGuess();
    } else if (c === 'BACKSPACE' || c === 'DEL') {
      if (_wordleState.currentGuess.length > 0) {
        _wordleState.currentGuess = _wordleState.currentGuess.slice(0, -1);
        updateWordleActiveRow();
      }
    } else if (/^[A-Z]$/.test(c)) {
      if (_wordleState.currentGuess.length < 5) {
        _wordleState.currentGuess += c;
        updateWordleActiveRow();
      }
    }
  }

  function submitWordleGuess() {
    if (_wordleState.isGameOver) return;

    if (_wordleState.currentGuess.length !== 5) {
      showWordleToast('Not enough letters');
      shakeWordleRow();
      return;
    }

    var guess = _wordleState.currentGuess.toUpperCase();
    if (!isValidWordleWord(guess)) {
      showWordleToast('Not in word list');
      shakeWordleRow();
      return;
    }

    var evalResult = evaluateGuess(guess, _wordleState.word);

    _wordleState.guesses.push({
      guess: guess,
      evalResult: evalResult
    });
    _wordleState.currentGuess = '';

    if (guess === _wordleState.word) {
      _wordleState.isGameOver = true;
      _wordleState.hasWon = true;
      recordGameParticipation();
      awardCredits(15, 'Wordle Victory');
      var stats = getArcadeStats();
      stats.wordlePlays = (stats.wordlePlays || 0) + 1;
      stats.wordleWins = (stats.wordleWins || 0) + 1;
      saveArcadeStats(stats);
    } else if (_wordleState.guesses.length >= _wordleState.maxTries) {
      _wordleState.isGameOver = true;
      _wordleState.hasWon = false;
      recordGameParticipation();
      var s = getArcadeStats();
      s.wordlePlays = (s.wordlePlays || 0) + 1;
      saveArcadeStats(s);
    }

    saveWordleState();
    renderWordleView();
  }

  function shakeWordleRow() {
    if (typeof document === 'undefined') return;
    var board = document.querySelector('.wordle-board');
    if (!board) return;
    var rows = board.querySelectorAll('.wordle-row');
    var activeRow = rows[_wordleState.guesses.length];
    if (activeRow) {
      activeRow.classList.remove('shake');
      void activeRow.offsetWidth;
      activeRow.classList.add('shake');
      setTimeout(function() {
        if (activeRow) activeRow.classList.remove('shake');
      }, 450);
    }
  }

  function updateWordleActiveRow() {
    var board = document.querySelector('.wordle-board');
    if (!board) return;
    var rows = board.querySelectorAll('.wordle-row');
    var activeRow = rows[_wordleState.guesses.length];
    if (!activeRow) return;

    var tiles = activeRow.querySelectorAll('.wordle-tile');
    for (var i = 0; i < 5; i++) {
      var letter = _wordleState.currentGuess[i] || '';
      tiles[i].textContent = letter;
      tiles[i].classList.toggle('filled', !!letter);
    }
  }

  // ── BB Trivia Game Engine ────────────────────────────────────────────────
  /**
   * Deterministically returns 5 distinct question indices from BB_TRIVIA_QUESTIONS
   * for a given calendar date key (e.g. '2026-11-03').
   */
  function getDailyTriviaQuestionIndices(dateKey) {
    var key = dateKey || getTodayDateKey();
    var seed = 0;
    for (var i = 0; i < key.length; i++) {
      seed = (seed * 31 + key.charCodeAt(i)) % 2147483647;
    }
    var total = BB_TRIVIA_QUESTIONS.length;
    var indices = [];
    for (var j = 0; j < total; j++) indices.push(j);
    for (var k = indices.length - 1; k > 0; k--) {
      seed = (seed * 9301 + 49297) % 233280;
      var rnd = (seed % 233280) / 233280;
      var swapIdx = Math.floor(rnd * (k + 1));
      var tmp = indices[k];
      indices[k] = indices[swapIdx];
      indices[swapIdx] = tmp;
    }
    return indices.slice(0, 5);
  }

  function getTriviaUserKey() {
    var ic = (typeof sessionGet === 'function') ? (sessionGet('ic') || sessionGet('email')) : null;
    return ic ? ('bb_trivia_' + String(ic).replace(/[^a-zA-Z0-9_-]/g, '_')) : 'bb_trivia_guest';
  }

  function saveTriviaState(state) {
    var st = state || _triviaState;
    if (!st || !st.dateKey) return;
    try {
      var uKey = getTriviaUserKey();
      if (typeof localStorage !== 'undefined') {
        var json = JSON.stringify(st);
        localStorage.setItem(uKey + '_' + st.dateKey, json);
        localStorage.setItem(uKey + '_active', json);
      }
    } catch (e) {
      console.warn('saveTriviaState error:', e);
    }
  }

  /**
   * Auto-submits any unsubmitted quiz left over from a prior date.
   * Awards credits (+5 per correct answer) and updates participation streak for that day.
   */
  function checkAndAutoSubmitPastTrivia(todayKey) {
    var today = todayKey || getTodayDateKey();
    var uKey = getTriviaUserKey();
    try {
      if (typeof localStorage === 'undefined') return;
      var rawActive = localStorage.getItem(uKey + '_active');
      if (!rawActive) return;
      var past = JSON.parse(rawActive);
      if (past && past.dateKey && past.dateKey < today && !past.isSubmitted) {
        var autoScore = 0;
        var qIndices = past.questionIndices || getDailyTriviaQuestionIndices(past.dateKey);
        var answers = past.answers || {};
        for (var i = 0; i < 5; i++) {
          var chosenOpt = answers[i];
          if (chosenOpt !== undefined && chosenOpt !== null) {
            var realQIdx = qIndices[i];
            if (BB_TRIVIA_QUESTIONS[realQIdx] && chosenOpt === BB_TRIVIA_QUESTIONS[realQIdx].correct) {
              autoScore++;
            }
          }
        }
        past.score = autoScore;
        past.isSubmitted = true;
        past.autoSubmitted = true;
        past.submittedAt = new Date().toISOString();

        if (autoScore > 0) {
          awardCredits(autoScore * 5, 'Past Daily BB Trivia (' + past.dateKey + ')');
        }
        recordGameParticipation(past.dateKey);

        var stats = getArcadeStats();
        stats.triviaPlays = (stats.triviaPlays || 0) + 1;
        stats.triviaScoreTotal = (stats.triviaScoreTotal || 0) + autoScore;
        saveArcadeStats(stats);

        localStorage.setItem(uKey + '_' + past.dateKey, JSON.stringify(past));
        localStorage.removeItem(uKey + '_active');
      }
    } catch (e) {
      console.warn('checkAndAutoSubmitPastTrivia error:', e);
    }
  }

  function loadTriviaState(optDate) {
    var today = (typeof optDate === 'string' && optDate) ? getTodayDateKey(optDate) : getTodayDateKey();
    var uKey = getTriviaUserKey();

    checkAndAutoSubmitPastTrivia(today);

    var saved = null;
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem(uKey + '_' + today);
        if (raw) saved = JSON.parse(raw);
      }
    } catch (e) {}

    if (saved && saved.dateKey === today) {
      _triviaState = saved;
      if (!_triviaState.questionIndices || _triviaState.questionIndices.length !== 5) {
        _triviaState.questionIndices = getDailyTriviaQuestionIndices(today);
      }
      if (!_triviaState.answers) _triviaState.answers = {};
    } else {
      _triviaState = {
        dateKey: today,
        questionIndices: getDailyTriviaQuestionIndices(today),
        answers: {},
        currentIndex: 0,
        isSubmitted: false,
        score: 0,
        submittedAt: null
      };
      saveTriviaState(_triviaState);
    }
    return _triviaState;
  }

  function initTrivia(optDate) {
    loadTriviaState(optDate);
    renderTriviaView();
  }

  function selectTriviaAnswer(optIndex) {
    if (_triviaState.isSubmitted) return;
    _triviaState.answers[_triviaState.currentIndex] = optIndex;
    saveTriviaState(_triviaState);
    renderTriviaView();
  }

  function prevTriviaQuestion() {
    if (_triviaState.currentIndex > 0) {
      _triviaState.currentIndex--;
      saveTriviaState(_triviaState);
      renderTriviaView();
    }
  }

  function nextTriviaQuestion() {
    if (_triviaState.currentIndex < 4) {
      _triviaState.currentIndex++;
      saveTriviaState(_triviaState);
      renderTriviaView();
    }
  }

  async function submitTriviaQuiz() {
    if (_triviaState.isSubmitted) return;

    var answeredCount = Object.keys(_triviaState.answers).length;
    if (answeredCount < 5) {
      var proceed = true;
      if (typeof showConfirmModal === 'function') {
        proceed = await showConfirmModal(
          'You have answered ' + answeredCount + ' of 5 questions. Unanswered questions will receive 0 points. Submit quiz now?',
          'Submit Daily BB Trivia?',
          { confirmText: 'Submit Now', cancelText: 'Review Answers' }
        );
      }
      if (!proceed) return;
    }

    var score = 0;
    var qIndices = _triviaState.questionIndices;
    for (var i = 0; i < 5; i++) {
      var chosen = _triviaState.answers[i];
      if (chosen !== undefined && chosen !== null) {
        var realIdx = qIndices[i];
        if (BB_TRIVIA_QUESTIONS[realIdx] && chosen === BB_TRIVIA_QUESTIONS[realIdx].correct) {
          score++;
        }
      }
    }

    _triviaState.score = score;
    _triviaState.isSubmitted = true;
    _triviaState.submittedAt = new Date().toISOString();
    saveTriviaState(_triviaState);

    if (score > 0) {
      awardCredits(score * 5, 'Daily BB Trivia');
    }
    recordGameParticipation('trivia');

    var stats = getArcadeStats();
    stats.triviaPlays = (stats.triviaPlays || 0) + 1;
    stats.triviaScoreTotal = (stats.triviaScoreTotal || 0) + score;
    saveArcadeStats(stats);

    renderTriviaView();
  }

  // Backward compatibility alias
  function answerTrivia(selectedIndex) {
    selectTriviaAnswer(selectedIndex);
  }

  // ── View Rendering Controllers ───────────────────────────────────────────
  function ensureArcadePageDOM() {
    if (typeof document === 'undefined') return null;
    var page = document.getElementById('page-arcade');
    var main = document.getElementById('app-main') || document.querySelector('.app-main') || document.querySelector('main');

    if (!page) {
      page = document.createElement('section');
      page.id = 'page-arcade';
      page.className = 'page';
      page.setAttribute('aria-label', '1stPJ Arcade');
      if (main) {
        main.appendChild(page);
      } else {
        document.body.appendChild(page);
      }
    } else if (main && page.parentElement !== main) {
      main.appendChild(page);
    }
    return page;
  }

  function renderArcadePage() {
    if (typeof document === 'undefined') return;
    var page = ensureArcadePageDOM();
    if (!page) return;

    // Deactivate other tabs
    document.querySelectorAll('.page').forEach(function(p) {
      if (p !== page) p.classList.remove('active');
    });
    page.classList.add('active');

    var stats = getArcadeStats();
    updateArcadeHeaderBadge(stats);
    fetchRemoteArcadeStats();

    page.innerHTML =
      '<div class="arcade-container">' +
        '<!-- Header Hero Card -->' +
        '<div class="card page-header-card arcade-hero-card" style="margin-bottom:14px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:8px;">' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
              '<div style="width:40px;height:40px;border-radius:10px;background:rgba(217,163,35,0.15);color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
                '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="6"/></svg>' +
              '</div>' +
              '<div>' +
                '<div class="page-title" style="margin:0;">1stPJ Arcade</div>' +
                '<div class="page-subtitle" style="margin:0;">Daily Wordle, Timed Trivia &amp; Gamified Syllabus Hub</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<div class="arcade-stat-pill" title="Current Daily Streak">' +
                '<span style="font-weight:700;font-size:14px;color:var(--text);">' + (stats.streak || 0) + '</span>' +
                '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="color:#f97316;"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>' +
                '<span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Streak</span>' +
              '</div>' +
              '<div class="arcade-stat-pill" title="Total Earned Credits">' +
                '<span style="font-weight:700;font-size:14px;color:var(--gold);">' + (stats.credits || 0) + '</span>' +
                '<span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Credits</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="page-desc">Strengthen your Boys\' Brigade knowledge, awards syllabus, and company history! Play the Daily Wordle and answer Timed BB Trivia to earn Credits and build your daily streak.</div>' +
        '</div>' +

        '<!-- Subtabs Bar -->' +
        '<div class="arcade-nav-tabs" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">' +
          '<button type="button" class="arcade-tab-btn ' + (_arcadeSubtab === 'wordle' ? 'active' : '') + '" onclick="switchArcadeSubtab(\'wordle\')">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M9 3v18"/><path d="M15 3v18"/><path d="M3 9h18"/><path d="M3 15h18"/></svg> <span>Daily Wordle</span>' +
          '</button>' +
          '<button type="button" class="arcade-tab-btn ' + (_arcadeSubtab === 'trivia' ? 'active' : '') + '" onclick="switchArcadeSubtab(\'trivia\')">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg> <span>BB Trivia</span>' +
          '</button>' +
          '<button type="button" class="arcade-tab-btn ' + (_arcadeSubtab === 'stats' ? 'active' : '') + '" onclick="switchArcadeSubtab(\'stats\')">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> <span>Rewards &amp; Streaks</span>' +
          '</button>' +
          '<button type="button" class="arcade-tab-btn ' + (_arcadeSubtab === 'shop' ? 'active' : '') + '" onclick="switchArcadeSubtab(\'shop\')" title="Profile Cosmetic Shop">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> <span>Cosmetic Shop</span>' +
          '</button>' +
        '</div>' +

        '<!-- Active Subtab Container -->' +
        '<div id="arcade-subtab-container"></div>' +
      '</div>';

    if (_arcadeSubtab === 'wordle') {
      initWordle();
    } else if (_arcadeSubtab === 'trivia') {
      initTrivia();
    } else if (_arcadeSubtab === 'shop') {
      if (typeof renderCosmeticShopView === 'function') {
        renderCosmeticShopView();
      } else if (typeof window !== 'undefined' && typeof window.renderCosmeticShopView === 'function') {
        window.renderCosmeticShopView();
      }
    } else {
      renderStatsView();
    }
  }

  function switchArcadeSubtab(subtab) {
    _arcadeSubtab = subtab;
    renderArcadePage();
  }

  // ── Subtab View: Daily Wordle ─────────────────────────────────────────────
  function renderWordleView() {
    var container = document.getElementById('arcade-subtab-container');
    if (!container) return;

    var letterStates = {};
    _wordleState.guesses.forEach(function(g) {
      for (var i = 0; i < 5; i++) {
        var char = g.guess[i];
        var state = g.evalResult[i];
        if (state === 'correct') {
          letterStates[char] = 'correct';
        } else if (state === 'present' && letterStates[char] !== 'correct') {
          letterStates[char] = 'present';
        } else if (!letterStates[char]) {
          letterStates[char] = 'absent';
        }
      }
    });

    var rowsHtml = '';
    for (var r = 0; r < _wordleState.maxTries; r++) {
      var isPastRow = r < _wordleState.guesses.length;
      var isCurrentRow = r === _wordleState.guesses.length;

      rowsHtml += '<div class="wordle-row" data-row="' + r + '">';
      for (var c = 0; c < 5; c++) {
        var letter = '';
        var tileClass = 'wordle-tile';

        if (isPastRow) {
          letter = _wordleState.guesses[r].guess[c];
          tileClass += ' ' + _wordleState.guesses[r].evalResult[c];
        } else if (isCurrentRow) {
          letter = _wordleState.currentGuess[c] || '';
          if (letter) tileClass += ' filled';
        }
        rowsHtml += '<div class="' + tileClass + '">' + (letter || '') + '</div>';
      }
      rowsHtml += '</div>';
    }

    var keyboardLayout = [
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
      ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE']
    ];

    var kbHtml = '<div class="wordle-keyboard">';
    keyboardLayout.forEach(function(row) {
      kbHtml += '<div class="wordle-kb-row">';
      row.forEach(function(key) {
        var kClass = 'wordle-key';
        if (key === 'ENTER' || key === 'BACKSPACE') kClass += ' wide';
        if (letterStates[key]) kClass += ' ' + letterStates[key];

        var keyDisplay = key;
        if (key === 'BACKSPACE') {
          keyDisplay = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>';
        }
        kbHtml += '<button type="button" class="' + kClass + '" onclick="handleWordleKey(\'' + key + '\')">' + keyDisplay + '</button>';
      });
      kbHtml += '</div>';
    });
    kbHtml += '</div>';

    var statusBanner = '';
    if (_wordleState.isGameOver) {
      if (_wordleState.hasWon) {
        statusBanner =
          '<div class="arcade-result-banner success">' +
            '<div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:16px;">' +
              '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#10b981;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
              '<span>Splendid! You solved today\'s Wordle!</span>' +
            '</div>' +
            '<div style="font-size:12.5px;color:var(--text-secondary);margin-top:4px;">Awarded +15 Credits! Streak updated. Come back tomorrow for a fresh puzzle!</div>' +
          '</div>';
      } else {
        statusBanner =
          '<div class="arcade-result-banner info">' +
            '<div style="font-weight:700;font-size:16px;">Good effort! Today\'s word was: <strong>' + _wordleState.word + '</strong></div>' +
            '<div style="font-size:12.5px;color:var(--text-secondary);margin-top:4px;">Daily participation streak recorded. Come back tomorrow to conquer the next puzzle!</div>' +
          '</div>';
      }
    }

    var stats = getArcadeStats();

    var sidePanelHtml =
      '<div class="wordle-side-panel">' +
        '<div class="arcade-side-card wordle-banner-desktop">' +
          (statusBanner ? statusBanner :
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
              '<div style="font-weight:700;font-size:14px;color:var(--text-primary);display:flex;align-items:center;gap:6px;">' +
                '<span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;"></span>' +
                'Today\'s Challenge' +
              '</div>' +
              '<span class="badge badge-active" style="font-size:11px;">+15 Credits</span>' +
            '</div>' +
            '<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.5;">' +
              'Guess the 5-letter BB syllabus term in 6 tries. Letter tiles flip to reveal clues after each guess!' +
            '</div>' +
            '<div style="margin-top:10px;font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between;">' +
              '<span>Attempts used: <strong>' + _wordleState.guesses.length + ' / 6</strong></span>' +
              '<span>Remaining: <strong>' + (_wordleState.maxTries - _wordleState.guesses.length) + '</strong></span>' +
            '</div>'
          ) +
        '</div>' +

        '<div class="arcade-side-card">' +
          '<div class="arcade-side-title">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
            '<span>How to Play &amp; Tile Colors</span>' +
          '</div>' +
          '<div class="wordle-guide-row">' +
            '<div class="wordle-guide-tile correct">B</div>' +
            '<div class="wordle-guide-text"><strong>Green:</strong> Letter is in the word and in the <strong>correct spot</strong>.</div>' +
          '</div>' +
          '<div class="wordle-guide-row">' +
            '<div class="wordle-guide-tile present">R</div>' +
            '<div class="wordle-guide-text"><strong>Gold:</strong> Letter is in the word, but in the <strong>wrong spot</strong>.</div>' +
          '</div>' +
          '<div class="wordle-guide-row">' +
            '<div class="wordle-guide-tile absent">X</div>' +
            '<div class="wordle-guide-text"><strong>Dark:</strong> Letter is <strong>not in the word</strong> in any spot.</div>' +
          '</div>' +
        '</div>' +


        '<div class="arcade-side-card">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<span style="font-size:16px;">🔥</span>' +
              '<span style="font-size:13px;font-weight:700;color:var(--text-primary);">' + (stats.streak || 0) + ' Day Streak</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<span style="font-size:16px;">🪙</span>' +
              '<span style="font-size:13px;font-weight:700;color:var(--gold);">' + (stats.credits || 0) + ' Credits</span>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<button type="button" class="portal-btn portal-btn-secondary" onclick="switchArcadeSubtab(\'trivia\')" style="flex:1;padding:8px 12px;font-size:12px;justify-content:center;">Play BB Trivia</button>' +
            '<button type="button" class="portal-btn portal-btn-secondary" onclick="switchArcadeSubtab(\'shop\')" style="flex:1;padding:8px 12px;font-size:12px;justify-content:center;">Cosmetic Shop</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    container.innerHTML =
      '<div class="wordle-desktop-grid">' +
        '<div class="card wordle-card wordle-game-card">' +
          '<div style="text-align:center;margin-bottom:14px;width:100%;">' +
            '<div style="font-family:var(--font-headline);font-size:18px;font-weight:700;color:var(--text);">Daily Wordle</div>' +
            '<div style="font-size:12px;color:var(--text-muted);">Guess today\'s 5-letter word in 6 tries. Green = correct spot, Gold = wrong spot.</div>' +
          '</div>' +
          '<div class="wordle-banner-mobile">' + statusBanner + '</div>' +
          '<div class="wordle-board-wrapper">' +
            '<div class="wordle-board">' + rowsHtml + '</div>' +
          '</div>' +
          kbHtml +
        '</div>' +
        sidePanelHtml +
      '</div>';
  }

  // ── Subtab View: BB Trivia ───────────────────────────────────────────────
  function renderTriviaCompletedView(container) {
    var pct = Math.round((_triviaState.score / 5) * 100);
    var earned = _triviaState.score * 5;

    var reviewHtml = '';
    for (var i = 0; i < 5; i++) {
      var qRealIdx = _triviaState.questionIndices[i];
      var qObj = BB_TRIVIA_QUESTIONS[qRealIdx];
      if (!qObj) continue;

      var userAnsIdx = _triviaState.answers[i];
      var isCorrect = (userAnsIdx === qObj.correct);
      var isAnswered = (userAnsIdx !== undefined && userAnsIdx !== null);
      var userAnsText = isAnswered ? qObj.options[userAnsIdx] : 'No answer submitted';

      reviewHtml +=
        '<div class="card trivia-review-card" style="padding:14px 16px;margin-bottom:10px;background:var(--bg-card-subtle, rgba(255,255,255,0.03));border:1px solid ' + (isCorrect ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)') + ';border-radius:10px;">' +
          '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px;">' +
            '<div style="font-weight:700;font-size:14px;color:var(--text);">' + (i + 1) + '. ' + qObj.q + '</div>' +
            '<span class="badge ' + (isCorrect ? 'badge-active' : 'badge-inactive') + '" style="flex-shrink:0;">' + (isCorrect ? 'Correct' : 'Incorrect') + '</span>' +
          '</div>' +
          '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">' +
            '<strong>Your answer:</strong> <span style="color:' + (isCorrect ? '#34d399' : '#f87171') + ';">' + userAnsText + '</span>' +
            (!isCorrect ? ' &middot; <strong>Correct answer:</strong> <span style="color:#34d399;">' + qObj.options[qObj.correct] + '</span>' : '') +
          '</div>' +
          '<div class="trivia-expl-box ' + (isCorrect ? 'correct' : 'incorrect') + '" style="margin-top:6px;padding:8px 12px;font-size:12px;">' +
            '<strong>Handbook Note:</strong> ' + qObj.expl +
          '</div>' +
        '</div>';
    }

    container.innerHTML =
      '<div class="card trivia-card" style="padding:24px 20px;">' +
        '<!-- Header Result Banner -->' +
        '<div class="arcade-result-banner success" style="margin-bottom:18px;">' +
          '<div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:16px;">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#10b981;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
            '<span>Today\'s BB Trivia Complete!</span>' +
          '</div>' +
          '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">' +
            'You scored <strong>' + _triviaState.score + ' / 5</strong> (' + pct + '%) &middot; Awarded <strong>+' + earned + ' Credits</strong>. Daily streak recorded!' +
          '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-top:6px;">' +
            'You can only take the quiz once per day. Come back tomorrow for a fresh set of questions!' +
          '</div>' +
        '</div>' +

        '<!-- Detailed Question Review Grid -->' +
        '<div style="margin-bottom:18px;">' +
          '<div style="font-family:var(--font-headline);font-size:15px;font-weight:700;color:var(--text);margin-bottom:12px;">Question Review &amp; Syllabus Explanations</div>' +
          '<div class="trivia-review-grid">' + reviewHtml + '</div>' +
        '</div>' +

        '<!-- Footer Action Button -->' +
        '<div style="text-align:center;">' +
          '<button type="button" class="portal-btn portal-btn-secondary" onclick="switchArcadeSubtab(\'stats\')" style="padding:9px 24px;">' +
            'View Streaks &amp; Credits' +
          '</button>' +
        '</div>' +
      '</div>';
  }

  function renderTriviaView() {
    var container = document.getElementById('arcade-subtab-container');
    if (!container) return;

    if (_triviaState.isSubmitted) {
      renderTriviaCompletedView(container);
      return;
    }

    var currentIdx = _triviaState.currentIndex || 0;
    var qRealIdx = _triviaState.questionIndices[currentIdx];
    var currentQ = BB_TRIVIA_QUESTIONS[qRealIdx];
    if (!currentQ) return;

    var chosenAnswer = _triviaState.answers[currentIdx];
    var progressPct = Math.round(((currentIdx + 1) / 5) * 100);
    var answeredTotal = Object.keys(_triviaState.answers).length;

    var optsHtml = '';
    currentQ.options.forEach(function(opt, idx) {
      var isSelected = (chosenAnswer === idx);
      var optClass = 'trivia-opt-btn' + (isSelected ? ' selected' : '');
      optsHtml +=
        '<button type="button" class="' + optClass + '" onclick="selectTriviaAnswer(' + idx + ')" aria-pressed="' + isSelected + '">' +
          '<span class="opt-letter">' + String.fromCharCode(65 + idx) + '</span>' +
          '<span class="opt-text">' + opt + '</span>' +
          (isSelected ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:auto;color:var(--accent);"><polyline points="20 6 9 17 4 12"/></svg>' : '') +
        '</button>';
    });

    var isLastQuestion = (currentIdx === 4);
    var stats = getArcadeStats();

    var triviaSidePanelHtml =
      '<div class="trivia-side-panel">' +
        '<div class="arcade-side-card">' +
          '<div class="arcade-side-title">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>' +
            '<span>Daily Quiz Rules</span>' +
          '</div>' +
          '<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.5;">' +
            '<div style="margin-bottom:6px;">&bull; <strong>5 Questions Daily:</strong> Selected each morning from the BB handbook.</div>' +
            '<div style="margin-bottom:6px;">&bull; <strong>+5 Credits:</strong> Awarded for every correct answer (up to +25 Credits per day).</div>' +
            '<div>&bull; <strong>1 Attempt Per Day:</strong> Take your time to review syllabus notes before submitting!</div>' +
          '</div>' +
        '</div>' +


        '<div class="arcade-side-card">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<span style="font-size:16px;">🔥</span>' +
              '<span style="font-size:13px;font-weight:700;color:var(--text-primary);">' + (stats.streak || 0) + ' Day Streak</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<span style="font-size:16px;">🪙</span>' +
              '<span style="font-size:13px;font-weight:700;color:var(--gold);">' + (stats.credits || 0) + ' Credits</span>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button type="button" class="portal-btn portal-btn-secondary" onclick="switchArcadeSubtab(\'wordle\')" style="flex:1;padding:8px 12px;font-size:12px;justify-content:center;">Play Wordle</button>' +
            '<button type="button" class="portal-btn portal-btn-secondary" onclick="switchArcadeSubtab(\'shop\')" style="flex:1;padding:8px 12px;font-size:12px;justify-content:center;">Cosmetic Shop</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    container.innerHTML =
      '<div class="trivia-desktop-grid">' +
        '<div class="card trivia-card">' +
          '<!-- Header: Question Counter & Progress -->' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
            '<div style="font-family:var(--font-headline);font-weight:700;color:var(--gold);font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">' +
              'Question ' + (currentIdx + 1) + ' of 5' +
            '</div>' +
            '<div class="trivia-answered-badge">' +
              '<span style="font-size:12px;font-weight:600;color:var(--text-secondary);">' + answeredTotal + ' of 5 answered</span>' +
            '</div>' +
          '</div>' +

          '<!-- Progress Bar (Determinate: 20% on Q1, 100% on Q5) -->' +
          '<div class="trivia-progress-track" role="progressbar" aria-valuenow="' + (currentIdx + 1) + '" aria-valuemin="1" aria-valuemax="5" aria-label="Quiz progress">' +
            '<div id="trivia-progress-bar" class="trivia-progress-bar" style="width:' + progressPct + '%;"></div>' +
          '</div>' +

          '<!-- Question Prompt -->' +
          '<div class="trivia-question-text">' + currentQ.q + '</div>' +

          '<!-- Options List -->' +
          '<div class="trivia-options-grid">' + optsHtml + '</div>' +

          '<!-- Navigation Controls -->' +
          '<div class="trivia-nav-row">' +
            '<button type="button" class="portal-btn portal-btn-secondary trivia-nav-btn" onclick="prevTriviaQuestion()"' + (currentIdx === 0 ? ' disabled' : '') + '>' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>' +
              '<span>Previous</span>' +
            '</button>' +

            (isLastQuestion ?
              '<button type="button" class="portal-btn portal-btn-primary trivia-nav-btn trivia-submit-btn" onclick="submitTriviaQuiz()">' +
                '<span>Submit Quiz</span>' +
                '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
              '</button>' :
              '<button type="button" class="portal-btn portal-btn-primary trivia-nav-btn" onclick="nextTriviaQuestion()">' +
                '<span>Next</span>' +
                '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
              '</button>'
            ) +
          '</div>' +
        '</div>' +
        triviaSidePanelHtml +
      '</div>';
  }

  // ── Subtab View: Rewards & Streaks ───────────────────────────────────────
  function renderStatsView() {
    var container = document.getElementById('arcade-subtab-container');
    if (!container) return;

    var stats = getArcadeStats();

    container.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:16px;margin-bottom:20px;width:100%;">' +
        '<div class="card" style="display:flex;align-items:center;gap:16px;padding:20px;">' +
          '<div style="width:52px;height:52px;border-radius:12px;background:rgba(249,115,22,0.15);color:#f97316;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
            '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;letter-spacing:0.5px;">Current Daily Streak</div>' +
            '<div style="font-size:26px;font-weight:800;color:var(--text);margin-top:2px;">' + (stats.streak || 0) + ' <span style="font-size:14px;font-weight:500;color:var(--text-secondary);">days</span></div>' +
          '</div>' +
        '</div>' +

        '<div class="card" style="display:flex;align-items:center;gap:16px;padding:20px;">' +
          '<div style="width:52px;height:52px;border-radius:12px;background:rgba(217,163,35,0.15);color:var(--gold);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
            '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;letter-spacing:0.5px;">Total Earned Credits</div>' +
            '<div style="font-size:26px;font-weight:800;color:var(--gold);margin-top:2px;">' + (stats.credits || 0) + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="card" style="display:flex;align-items:center;gap:16px;padding:20px;">' +
          '<div style="width:52px;height:52px;border-radius:12px;background:rgba(16,185,129,0.15);color:#10b981;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
            '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;letter-spacing:0.5px;">All-Time Best Streak</div>' +
            '<div style="font-size:26px;font-weight:800;color:var(--text);margin-top:2px;">' + (stats.bestStreak || 0) + ' <span style="font-size:14px;font-weight:500;color:var(--text-secondary);">days</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(380px, 1fr));gap:16px;width:100%;">' +
        '<div class="card" style="padding:22px;">' +
          '<div style="font-family:var(--font-headline);font-size:17px;font-weight:700;color:var(--text);margin-bottom:8px;">How Daily Streaks Work</div>' +
          '<div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">' +
            '<p style="margin-bottom:8px;"><strong>Consecutive Participation:</strong> Play either Daily Wordle or BB Trivia each calendar day to maintain and increment your streak. Playing 3 days in a row gives a streak of 3. If you miss a calendar day, the streak resets to 0.</p>' +
            '<p style="margin:0;">Building long streaks unlocks milestone accolades, prestige profile indicators, and special recognition across the 1st Petaling Jaya Company.</p>' +
          '</div>' +
        '</div>' +

        '<div class="card" style="padding:22px;">' +
          '<div style="font-family:var(--font-headline);font-size:17px;font-weight:700;color:var(--text);margin-bottom:8px;">Credit Earning Rates &amp; Spending</div>' +
          '<div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">' +
            '<ul style="margin:6px 0 12px 20px;">' +
              '<li><strong>Daily Wordle:</strong> +15 Credits for successfully solving today\'s 5-letter word puzzle.</li>' +
              '<li><strong>BB Trivia:</strong> +5 Credits for every correct multiple-choice answer (up to +25 Credits per 5-question round).</li>' +
            '</ul>' +
            '<p style="margin:0;">Spend your earned credits in the <strong>Cosmetic Shop</strong> to unlock animated RGB avatar outlines, custom gradients, status aura rings, and profile customizers!</p>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // ── Global Physical Keyboard Listener for Wordle ──────────────────────────
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', function(e) {
      if (_arcadeSubtab !== 'wordle') return;
      var arcadePage = document.getElementById('page-arcade');
      if (!arcadePage || !arcadePage.classList.contains('active')) return;

      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Enter') {
        e.preventDefault();
        handleWordleKey('ENTER');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleWordleKey('BACKSPACE');
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        handleWordleKey(e.key.toUpperCase());
      }
    });

    // Auto-update header on DOM load
    document.addEventListener('DOMContentLoaded', function() {
      updateArcadeHeaderBadge();
      fetchRemoteArcadeStats();
    });
  }

  // ── Exports ───────────────────────────────────────────────────────────────
  var ArcadeModule = {
    BB_WORDLE_WORDS: BB_WORDLE_WORDS,
    ALL_WORDLE_WORDS: ALL_WORDLE_WORDS,
    BB_TRIVIA_QUESTIONS: BB_TRIVIA_QUESTIONS,
    getTodayDateKey: getTodayDateKey,
    getYesterdayDateKey: getYesterdayDateKey,
    getDailyWordleWord: getDailyWordleWord,
    getDailyTriviaQuestionIndices: getDailyTriviaQuestionIndices,
    getArcadeUserKey: getArcadeUserKey,
    getTriviaUserKey: getTriviaUserKey,
    getArcadeStats: getArcadeStats,
    saveArcadeStats: saveArcadeStats,
    fetchRemoteArcadeStats: fetchRemoteArcadeStats,
    recordGameParticipation: recordGameParticipation,
    awardCredits: awardCredits,
    updateArcadeHeaderBadge: updateArcadeHeaderBadge,
    initWordle: initWordle,
    evaluateGuess: evaluateGuess,
    handleWordleKey: handleWordleKey,
    submitWordleGuess: submitWordleGuess,
    initTrivia: initTrivia,
    loadTriviaState: loadTriviaState,
    saveTriviaState: saveTriviaState,
    checkAndAutoSubmitPastTrivia: checkAndAutoSubmitPastTrivia,
    selectTriviaAnswer: selectTriviaAnswer,
    prevTriviaQuestion: prevTriviaQuestion,
    nextTriviaQuestion: nextTriviaQuestion,
    submitTriviaQuiz: submitTriviaQuiz,
    answerTrivia: answerTrivia,
    ensureArcadePageDOM: ensureArcadePageDOM,
    renderArcadePage: renderArcadePage,
    switchArcadeSubtab: switchArcadeSubtab,
    isValidWordleWord: isValidWordleWord,
    showWordleToast: showWordleToast,
    WORDLE_DICTIONARY_SET: WORDLE_DICTIONARY_SET
  };

  if (typeof window !== 'undefined') {
    window.BB_WORDLE_WORDS               = BB_WORDLE_WORDS;
    window.ALL_WORDLE_WORDS              = ALL_WORDLE_WORDS;
    window.BB_TRIVIA_QUESTIONS            = BB_TRIVIA_QUESTIONS;
    window.getArcadeUserKey               = getArcadeUserKey;
    window.getTriviaUserKey               = getTriviaUserKey;
    window.getArcadeStats                 = getArcadeStats;
    window.saveArcadeStats                = saveArcadeStats;
    window.fetchRemoteArcadeStats         = fetchRemoteArcadeStats;
    window.recordGameParticipation        = recordGameParticipation;
    window.awardCredits                   = awardCredits;
    window.updateArcadeHeaderBadge        = updateArcadeHeaderBadge;
    window.handleWordleKey                = handleWordleKey;
    window.submitWordleGuess              = submitWordleGuess;
    window.initTrivia                     = initTrivia;
    window.loadTriviaState                = loadTriviaState;
    window.saveTriviaState                = saveTriviaState;
    window.checkAndAutoSubmitPastTrivia   = checkAndAutoSubmitPastTrivia;
    window.selectTriviaAnswer             = selectTriviaAnswer;
    window.prevTriviaQuestion             = prevTriviaQuestion;
    window.nextTriviaQuestion             = nextTriviaQuestion;
    window.submitTriviaQuiz               = submitTriviaQuiz;
    window.answerTrivia                   = answerTrivia;
    window.ensureArcadePageDOM            = ensureArcadePageDOM;
    window.renderArcadePage               = renderArcadePage;
    window.switchArcadeSubtab             = switchArcadeSubtab;
    window.isValidWordleWord              = isValidWordleWord;
    window.showWordleToast                = showWordleToast;
    window.ArcadeModule                   = ArcadeModule;
  }

  if (typeof global !== 'undefined') {
    global.getArcadeStats = getArcadeStats;
    global.saveArcadeStats = saveArcadeStats;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArcadeModule;
  }

})();

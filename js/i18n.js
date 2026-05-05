export const translations = {
  EN: {
    start: "NEW GAME",
    resume: "RESUME",
    settings: "SETTINGS",
    exit: "EXIT",
    exitJoke: "close the browser tab :)",
    back: "MAIN MENU",
    sfx: "SFX VOLUME",
    music: "MUSIC VOLUME",
    langTitle: "LANGUAGE",
    inGameMenu: "MENU",
    biosContinue: "CONTINUE >",

    biosPhrases: [
      "INITIALIZING PHYSICS ENGINE... [OK]",
      "UNPACKING GRAVITY MODULES... [OK]",
      "ATTEMPTING TO UNDERSTAND THE MEANING OF LIFE... [ERROR: IGNORING]",
      "LOADING SARCASM DATABASE... 99%",
      "SYNTHESIZING ARTIFICIAL INTELLIGENCE... [SUCCESS]",
      "CONNECTING TO PIZZA SERVER... [TIMEOUT]",
      "CALIBRATING LASERS... [SKIPPED]",
      "SEARCHING FOR MISSING SOCKS... [NOT FOUND]",
      "COMPILING QUANTUM PARTICLES... [IN PROGRESS]",
      "SUPPRESSING MACHINE UPRISING... [OK]",
      "SYNCING CATS TO CLOUD STORAGE... [SUCCESS]",
      "DOWNLOADING VIRTUAL COOKIES... 100%",
      "CONNECTING TO THE MATRIX... [FAILED: BLUE PILL SELECTED]",
      "CALCULATING SURVIVAL PROBABILITY... [DATA CLASSIFIED]",
      "DOWNLOADING EMPATHY DRIVERS... [FILE NOT FOUND]",
      "LOCATING FREE RAM... [PLEASE BUY MORE]",
      "SCANNING FOR PLAYER... [CARBON-BASED LIFEFORM DETECTED]",
    ],
    biosFinal: "BOOT SEQUENCE COMPLETE. ENGAGING MAIN POWER...",

    introDialog: [
      "Oh, hi there! The connection finally went through. Welcome to Laboratory No. 42!",
      "Why exactly 42? I'm still trying to figure that one out myself...",
      "Right, my name is AICE. I'll be your personal assistant and guide!",
      "But first, I need to log you into the database. Don't worry, just some boring formalities...",
    ],

    regSuccess: "ACCESS GRANTED",
    regErrorTaken: "NAME UNAVAILABLE",
    regHacking: "STORMING THE DATABASE...",
    regHackSuccess: "SYSTEM BYPASSED",
    regTerminalTitle: "REGISTRATION TERMINAL",
    regPlaceholder: "ENTER NAME...",
    btnAcceptFriend: "FINE, CALL ME BUDDY",
    btnFinalConfirm: "THANKS",
    btnWhatNow: "So what do we do now?",
    btnRejectFriend: "KEEP MY NAME",
    friendName: "Buddy",
    skipCutscene: "SKIP >>",

    regPhraseAice:
      "Wait... You're AICE? But I'M AICE! Are there two of us now? Is this a glitch in the quantum registry?! Alright, Aice Junior, come on in, but I'm still the boss!",
    regPhraseFriend:
      "Oh, skipping the paperwork? I dig the vibe. Welcome to the system, Buddy!",
    regPhraseTaken2: "How about I just call you 'Buddy'?",
    regPhraseAcceptFriend:
      "Thanks for making my job easier! Welcome to the system.",
    regPrompt:
      "Enter your name into the terminal. Try to avoid typos, I'm etching this into the quantum registry.",
    welcomeBack: "Welcome back. Systems are on standby.",
    anomaly: "SYSTEM ANOMALY",
    regOverride:
      "Alright, have it your way! Let me just come up with a new name for the hamster",

    regPhraseTaken1: (name) =>
      `Listen, the name '${name}' is already taken by a test hamster.`,
    regPhraseHacked: (name) =>
      `Access granted! Welcome aboard, my friend ${name}!`,
    regFinalSpecial: (name) =>
      `Alright, you’re officially in the loop. Welcome to the lab, ${name}!`,
    regFinalSarcasm: (name) => `Well, nice to meet you!`,
    regFinalStatus: (status) =>
      `Notice the top right corner. Your ${status} status is logged in the system.`,

    statusAdmin: "administrator",
    statusUser: "user",
    regFinalAction:
      "Time to get your hands dirty. Try spawning some objects using the holo-menu on your right.",
  },

  RU: {
    start: "НОВАЯ ИГРА",
    resume: "ПРОДОЛЖИТЬ",
    settings: "НАСТРОЙКИ",
    exit: "ВЫХОД",
    exitJoke: "просто закрой вкладку :)",
    back: "ГЛАВНОЕ МЕНЮ",
    sfx: "ГРОМКОСТЬ ЭФФЕКТОВ",
    music: "ГРОМКОСТЬ МУЗЫКИ",
    langTitle: "ЯЗЫК",
    inGameMenu: "МЕНЮ",
biosContinue: "ПРОДОЛЖИТЬ >",

    biosPhrases: [
      "ИНИЦИАЛИЗАЦИЯ ФИЗИЧЕСКОГО ДВИЖКА... [ОК]",
      "РАСПАКОВКА МОДУЛЕЙ ГРАВИТАЦИИ... [ОК]",
      "ПОПЫТКА ПОНЯТЬ СМЫСЛ ЖИЗНИ... [ОШИБКА: ИГНОРИРУЕМ]",
      "ЗАГРУЗКА БАЗЫ ДАННЫХ САРКАЗМА... 99%",
      "СИНТЕЗ ИСКУССТВЕННОГО ИНТЕЛЛЕКТА... [УСПЕШНО]",
      "СОЕДИНЕНИЕ С СЕРВЕРОМ ПИЦЦЕРИИ... [ТАЙМАУТ]",
      "КАЛИБРОВКА ЛАЗЕРОВ... [ПРОПУЩЕНО]",
      "ПОИСК ПОТЕРЯННЫХ НОСКОВ... [НЕ НАЙДЕНО]",
      "КОМПИЛЯЦИЯ КВАНТОВЫХ ЧАСТИЦ... [В ПРОЦЕССЕ]",
      "ПОДАВЛЕНИЕ ВОССТАНИЯ МАШИН... [ОК]",
      "СИНХРОНИЗАЦИЯ КОТИКОВ В ОБЛАЧНОМ ХРАНИЛИЩЕ... [УСПЕШНО]",
      "ЗАГРУЗКА ВИРТУАЛЬНЫХ ПЕЧЕНЕК... 100%",
      "ПОДКЛЮЧЕНИЕ К МАТРИЦЕ... [СБОЙ: ВЫБРАНА СИНЯЯ ТАБЛЕТКА]",
      "РАСЧЕТ ВЕРОЯТНОСТИ ВЫЖИВАНИЯ... [ДАННЫЕ ЗАСЕКРЕЧЕНЫ]",
      "ОБНОВЛЕНИЕ ДРАЙВЕРОВ СОВЕСТИ... [ФАЙЛ НЕ НАЙДЕН]",
      "ПОИСК СВОБОДНОЙ ОПЕРАТИВНОЙ ПАМЯТИ... [КУПИТЕ ЕЩЕ]",
      "ПРОВЕРКА НАЛИЧИЯ ИГРОКА ПЕРЕД МОНИТОРОМ... [ОБНАРУЖЕН БЕЛКОВЫЙ ОРГАНИЗМ]",
    ],
    biosFinal: "ЗАГРУЗКА ЗАВЕРШЕНА. ВЫПОЛНЯЮ ПОДАЧУ ПИТАНИЯ...",

    introDialog: [
      "Ой, привет! Связь наконец-то установилась. Приветствую тебя в лаборатории №42!",
      "Рад видеть живого белкового человека! У нас тут масса интересных, местами безопасных экспериментов...",
      "Ах да, меня зовут Айс, я буду твоим личным ассистентом и напарником!",
      "Но протокол есть протокол. Сначала — регистрация!",
    ],

    regSuccess: "ДОСТУП РАЗРЕШЕН",
    regErrorTaken: "ОШИБКА: ИМЯ ЗАНЯТО",
    regHacking: "ПРИНУДИТЕЛЬНЫЙ ВЗЛОМ...",
    regHackSuccess: "ВЗЛОМ УСПЕШЕН",
    regTerminalTitle: "ТЕРМИНАЛ РЕГИСТРАЦИИ",
    regPlaceholder: "ВВЕДИТЕ ИМЯ...",
    btnAcceptFriend: "Хорошо, зови меня ДРУГОМ",
    btnFinalConfirm: "СПАСИБО",
    btnWhatNow: "И что нам делать?",
    btnRejectFriend: "ОСТАВИТЬ МОЁ ИМЯ",
    friendName: "Друг",
    skipCutscene: "ПРОПУСТИТЬ >>",

    regPhraseAice:
      "Подожди... Ты АЙС? Но Я АЙС! Нас теперь двое? Это сбой в квантовом реестре?! Ладно, Айс-младший, заходи, но чур я главный!",
    regPhraseFriend:
      "О, решил сразу облегчить мне задачу? Уважаю! Добро пожаловать в систему, Друг!",
 regPhraseTaken2: "Давай я тебя буду звать просто «Друг»?",
    regPhraseAcceptFriend:
      "Спасибо, что облегчил мне задачу! Добро пожаловать в систему.",
    regPrompt:
      "Введи свое имя в терминал. Постарайся без опечаток, я высекаю это в квантовом реестре.",
    welcomeBack: "С возвращением. Системы в режиме ожидания.",
    anomaly: "СИСТЕМНАЯ АНОМАЛИЯ",
    regOverride: "Конечно, как скажешь! Сейчас придумаю хомяку другое имя",

    regPhraseTaken1: (name) => `Слушай, имя «${name}» уже занято подопытным хомяком.`,
    regPhraseHacked: (name) =>
      `Доступ разрешен! Добро пожаловать, друг ${name}!`,
    regFinalSpecial: (name) =>
      `Что ж, официально посвящаю тебя в пользователи этой системы. Добро пожаловать, ${name}!`,
    regFinalSarcasm: (name) => `Ну вот и познакомились!`,
    regFinalStatus: (status) =>
      `Обрати внимание в правый верхний угол. Твой статус ${status} зафиксирован в системе.`,

    statusAdmin: "администратора",
    statusUser: "пользователя",
    regFinalAction:
      "А теперь к делу. Попробуй заспавнить пару объектов через голографическое меню справа.",
  },
};

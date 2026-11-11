/**
 * English dictionary — the SOURCE OF TRUTH for the dictionary shape (Pkg9 · N1).
 * pt.ts is typed `Dict = typeof en`, so a missing key fails `tsc --noEmit`
 * (translation parity becomes a build gate for free).
 *
 * Scope = Layer A (chrome + didactic copy) from the R1 inventory. Layer B names
 * (departments / functions / job titles / skill slugs) and Layer C (dash + peek
 * demo data) are NOT here — they stay EN as product taxonomy / integration data.
 */
export const en = {
  common: {
    close: "Close",
    dismiss: "Dismiss",
    done: "Done",
    back: "Back",
    next: "Next",
    toggleFullscreen: "Toggle full screen",
    clearSearch: "Clear search",
    searchJobs: "Search jobs",
  },

  shell: {
    nav: {
      inicio: "Home",
      map: "Map",
      hub: "Hub",
      modules: "Modules",
      myTree: "My tree",
      brain: "Brain",
      capacitacoes: "AI University",
      mentorias: "Mentorships",
      solucoes: "Solutions",
      apps: "Systems",
      community: "Community",
      myAccount: "My account",
      support: "Support",
    },
    workspace: "Workspace",
    demo: "Demo",
    free: "Free",
    pro: "Pro",
    logout: "Log out",
    memberSettings: "Member · Settings",
    lightMode: "Light mode",
    darkMode: "Dark mode",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    toggleTheme: "Toggle light or dark mode",
    togglePlan: (plan: string) => `Toggle plan — currently ${plan}`,
    language: "Language",
    toggleLanguage: "Switch language",
  },

  hub: {
    skillsLive: (n: number) => `${n} skills live`,
    catchUp: "new drops this week · pick up where you left off",
    onTheList: (n: string) => `${n} on the list`,
    openTheMap: "Open the map",
    modules: "Modules",
    modulesSub: "build your AI workforce, step by step",
    allModules: "All modules →",
    freshDrops: "Fresh drops",
    newestSub: "newest skills, fresh each week",
    seeAll: (n: number) => `See all ${n} →`,
    liveFooter: "Arkom Hub · live. New skills drop every week.",
    installs: (n: number) => `${n} installs`,
    searchPlaceholder: 'Search the tree, find a skill, or jump to a job… try "carousel"',
    passwordPre: "Prefer a password? ",
    passwordLink: "Set one in Settings",
    passwordPost: " and skip the email link next time.",
    dismiss: "Dismiss",
    // Get Started onboarding card (member 5-step + free starter)
    getStarted: {
      eyebrow: "Get started",
      memberTitle: "Your first week, in five steps.",
      freeTitle: "Install your first skill.",
      done: "Done",
      s1t: "See how it all fits",
      s1s: "Three minutes on what you've unlocked: the map, the modules, weekly drops, and the brain.",
      s2t: "Get Claude Code running",
      s2s: "Your skills run inside Claude Code. Install it once and everything on the map plugs in. On your phone? Save this one for your computer. That's where Claude Code lives.",
      s3t: "Install your first skill",
      s3s: "Pick a starter, install it, run it. This is the moment your tree starts lighting up.",
      s4t: "Connect Claude to your stack",
      s4s: "One connection (Notion, Gmail, your CRM) turns skills from demos into real work.",
      s5t: "Start your brain",
      s5s: "The multiplier. Every skill you install reads from it, so your agents know your offers, clients, and voice.",
      installGuide: "Open the install guide",
      alreadyHaveIt: "I already have it",
      seeMcps: "See how MCPs work",
      alreadyConnected: "Already connected",
      openBrain: "Open Build Your Brain",
      starterClaudeMd: "Get the starter CLAUDE.md",
      freePickTitle: "Pick a starter skill",
      freePickSub:
        "Install one into your own Claude and watch your tree light up. Each one is a runnable job, ready to go.",
    },
    // drop / module / featured / aside cards
    cards: {
      install: "Install",
      installed: "Installed",
      featuredEyebrow: "Featured this week",
      installSkill: "Install skill",
      mostInstalled: "Most installed",
      allTime: "all time",
      buildLogs: "Build logs",
      from: (author: string) => `from ${author}`,
      nextDrop: "Next drop",
      lands: (when: string) => `lands ${when}`,
      installedToast: (title: string) => `Installed · ${title}`,
      communityPulse: "Community pulse",
      live: "live",
      memberInstalled: "A member installed",
      memberBuiltBrain: "A member built their brain",
      hoursAgo: (n: number) => `${n}h ago`,
    },
    // Fresh-drops skill reader modal (Pkg10 · N7 FD2/FD3)
    reader: {
      sub: (dept: string) => `${dept} · read it, then install into your Claude`,
      installLabel: "Install · paste in your terminal",
      copy: "Copy",
      copied: "Copied",
      footRunPre: "Paste it, hit enter, restart Claude Code, then type",
      footRunPost: "to run it.",
      downloadFile: "Prefer the file? Download SKILL.md",
      seeOnMap: "See it on the map →",
    },
    // Stats strip (Pkg15 · Feature C) — the .mystrip pulse above Get Started
    stats: {
      installed: "installed",
      runs: "run",
      streakPrefix: "",
      streakValue: "1w",
      streakSuffix: " streak",
      myTree: "My tree",
    },
  },

  map: {
    tabs: { map: "MAP", dash: "DASHBOARDS", chart: "CHART" },
    bookCall: "Book a call",
    searchPlaceholder: "search 67 jobs · Bia, Genesis, DRE, screening…",
    aboutMap: "About this map",
    backToDepts: "Back to all departments",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    fit: "Fit",
    levelLabel: {
      autonomous: "fully autonomous",
      assisted: "human-assisted",
      led: "human-led",
    },
    nodeZero: {
      knowledgeBase: "Knowledge Base",
      subtitle: "node zero · the company brain",
      title: "Company Knowledge Base",
      badge: "NODE ZERO",
      hubLine: "The hub · every department reads & writes",
      doctrineLabel: "doctrine",
      readingLabel: "reading",
      auditLabel: "audit",
      drawer: {
        beforeEverything: "Before everything",
        desc: "The single place every agent reads from and writes to. Not software you buy · plain files with a strict convention: who the company is, what it sells, how it speaks, what is true right now. An agent with this context writes like a colleague. An agent without it writes like a stranger.",
        shipsFiles: "2 runnable skill files",
        shipsWith: " ships with this job",
        preview: "Preview",
        whatLivesIn: "What lives in it",
        whatItReplaces: "What it replaces",
        whatItReplacesBody: "Re-briefing every tool, agency, hire, and AI session from scratch, forever. The context tax is invisible because everyone pays it · until one company stops paying it and starts compounding instead.",
        ladder: "The ladder",
        ladderLed: "Context lives in the founder's head and a thousand chat threads. Every new session starts at zero.",
        ladderAssisted: "Core files exist · company, offer, voice, per-client state · and humans update them after meaningful work.",
        ladderAutonomous: "Every transcript, email, and deliverable writes itself back. Any agent or human reads one page and is current. The brain maintains the brain.",
        human: "The human",
        humanBody: "Everyone writes to it, one human owns it · usually the founder, eventually an ops lead. Ownership of the brain is the last job that never automates.",
        buildNotes: "Build notes",
        buildNotesBody: "Build this before anything else on the map · every department's first node assumes it exists. It is one session of work: scaffold the files, get interviewed, install the read-before-write rules. The test that it works: a smart stranger could read the folder and act for you tomorrow. The dedicated skill does the entire setup.",
        skillsRead: "read",
        skillsLocked: "locked",
        readSkillMd: "READ · SKILL.MD",
        lockedTap: "Locked · tap to preview",
        skillDescNode: "Scaffolds the files and the writing convention.",
        skillDescAudit: "Inspects your real stack and grades what's live.",
        unlockCta: "Unlock every runnable skill file · $49/mo founding",
        needHelp: "Need help building this?",
      },
    },
  },

  chart: {
    subtitle: "· the AI rollout",
    rolloutLine: (auto: number, assisted: number) =>
      `${auto} jobs run autonomously · ${assisted} assisted · the rest stay human.`,
    rolloutBold: (auto: number, total: number) => `${auto} of ${total} jobs`,
    rolloutMid: "run autonomously ·",
    assistedBold: (n: number) => `${n} assisted`,
    rolloutEnd: "· the rest stay human.",
    jobsWord: "jobs",
    rolloutOrder: "Rollout order",
    first: "first",
    last: "last",
    legend: {
      led: "Human-led",
      assisted: "Human-assisted",
      autonomous: "Fully autonomous",
    },
    stages: {
      foundation: "Foundation",
      capture: "Capture",
      generate: "Generate",
      orchestrate: "Orchestrate",
    },
    stageSub: {
      foundation: "Data + the company brain",
      capture: "Classify, extract, score",
      generate: "Produce work, take action",
      orchestrate: "Agents, monitoring, loops",
    },
    drawer: {
      moreDetail: "More detail",
      whyHuman: "Why it stays human",
      replaces: "Replaces",
      ladder: "From manual to autonomous",
      ongoing: "Ongoing",
      noJobs: "No jobs yet",
      whatItDoes: "What it does",
      skills: "Skills",
      tools: "Tools",
      now: "NOW",
      replacesBody: "The by-hand cost — the headcount and hours this removes — ships in the full playbook.",
      noSkillManual: "A person owns this — no skill file.",
      skillInProgress: "Skill file in progress.",
      noTools: "No external tools — runs in-house.",
      bookCall: "Book a call",
      partOfRollout: (dept: string) => `Part of the ${dept} rollout`,
    },
  },

  dash: {
    // CHROME ONLY — the KPIs/campaigns/deals data stays EN (Layer C, frozen)
    searchPanels: "Search panels",
    timeRange: "Time range",
    guide: {
      membersOnly: "Members only",
      unlock: "Unlock this dashboard",
      finePrint: "Founding-cohort members get every command center.",
      eyebrow: "Member build guide",
      intro: (tool: string) =>
        `The exact one-shot prompt that builds this dashboard, plus the step-by-step guide to wire ${tool} into Claude Code.`,
      setup: (tool: string, time: string) => `${tool} · setup ${time}`,
      howItConnects: "How it connects",
      unlockPrompt: "Unlock the one-shot prompt →",
      membership: "Included with Arkom membership · every command center ships with its build guide.",
    },
    bookCall: "Book a call",
  },

  brain: {
    title: "Brain",
    tagline: "a 10-minute interview writes it for you",
    intro:
      "Your brain is the context at the center of your tree. Every skill you install reads from it, so your agents know your offers, clients, and voice before they do a single job.",
    buildYourBrain: "Build your brain",
    buildYourBrainBody:
      "The full build lives in the modules. Build Your Brain walks you through it end to end · set it up in Notion and Obsidian, wire it to Claude, and feed it automatically with the capture workflow · with a starter CLAUDE.md you can paste in.",
    openModule: "Open the Build Your Brain module →",
    starterClaudeMd: "Get the starter CLAUDE.md",
    whatLives: "What lives in your brain",
    stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
    estTime: "≈10 min",
    buildMyBrain: "Build my brain",
    builtToast: "Your brain is built",
    stepTitles: {
      whatYouDo: "What you do",
      whatYouSell: "What you sell",
      whoYouServe: "Who you serve",
      voiceTone: "Voice & tone",
      goals: "Goals — next 90 days",
      toolsStack: "Tools & stack",
      channels: "Channels",
      review: "Review & confirm",
    },
    channels: {
      outbound: "Outbound",
      inbound: "Inbound",
      paid: "Paid",
      partners: "Partners",
      community: "Community",
    },
    voiceExamples: {
      direct: "Direct & concise",
      warm: "Warm & personal",
      bold: "Bold & contrarian",
      expert: "Expert & precise",
    },
    fields: {
      doLabel: "Describe what your company does, in a sentence or two.",
      doPlaceholder: "We help B2B logistics teams automate freight-invoice processing…",
      sellLabel: "What do you sell?",
      sellPlaceholder: "Productized automation engagements, in phases…",
      priceLabel: "Typical price (optional)",
      pricePlaceholder: "$8k setup + $2k/mo",
      icpLabel: "Who's your ideal customer? Industry, size, the person you sell to.",
      icpPlaceholder: "Ops & finance leaders at 20–200 person logistics SaaS…",
      voiceLabel: "How should your agents sound? Tap an example to start, then make it yours.",
      voicePlaceholder: "Direct, a little dry, allergic to hype…",
      goalsLabel: "What are you trying to move in the next 90 days?",
      goalsPlaceholder: "Book 12 qualified calls/mo from outbound; ship 2 client phases…",
      toolsLabel: "What's in your stack? Pick what applies and add anything missing.",
      toolsOtherPlaceholder: "Other tools, comma-separated…",
      channelsLabel: "Which channels do you actually run?",
      reviewIntro: "Here's what your brain will hold. Go back to edit anything, or build it.",
      goalsReview: "Goals (90 days)",
      notAnswered: "Not answered yet",
    },
    pillars: {
      voiceTitle: "Voice",
      fromYourBrain: "From your brain",
      doDesc: "Your one-liner, so every agent leads with the right positioning.",
      sellDesc: "Offers and pricing, so proposals and replies quote you correctly.",
      icpDesc: "Your ICP, so outreach and content speak to the right buyer.",
      voiceDesc: "How you sound, so nothing reads like a generic bot.",
    },
    card: {
      resume: "Resume your brain interview",
      build: "Build your brain in 10 minutes",
      body: "An 8-step interview writes your context — what you do, your offers, your ICP, your voice — so every skill reads the real you.",
      voiceToast: "Voice mode — coming to the rebuild",
      talk: "Talk",
      reviewAnswers: "Review answers",
      resumeShort: "Resume",
      typeMyself: "I'll type it myself",
      draftAi: "Draft my brain with AI →",
      freeTitle: "Unlock the 10-min brain interview",
      freeBody: "Answer 8 quick questions and your brain writes itself — offers, ICP, and voice, ready for every skill. Pro members only.",
      unlockPro: "Unlock with Pro",
    },
    // Real brain flow chrome (Pkg10 · N6) — fast + steps + install.
    listening: "Listening…",
    drafting: "Drafting your brain…",
    continueCta: "Continue",
    buildBrainCta: "Build your brain →",
    saving: "Saving…",
    skip: "Skip",
    copyCmd: "Copy",
    copied: "Copied",
    fillToContinue: "Fill this in to continue.",
  },

  tree: {
    installed: "Installed",
    brain: "Brain",
    built: "Built",
    soon: "Soon",
    streak: "Streak",
    memberSince: "Member since",
    findMore: "Find more skills",
    title: "My tree",
    titleSub: "the skills you've installed",
    findMoreShort: "Find more",
    yourTree: "Your tree",
    nInstalled: (n: number) => `${n} installed`,
    removeAria: (name: string) => `Remove ${name}`,
    installedToast: (name: string) => `Installed · ${name}`,
    empty: "Nothing installed yet. Find a skill to plant your first branch.",
    emptyPre: "Nothing installed yet. ",
    emptyLink: "Browse this week's drops",
    emptyPost: " and install your first skill, and it'll light up here.",
    findMoreSub: "Install into your tree",
    searchSkills: "Search skills…",
    install: "Install",
    noMatch: (q: string) => `No skills match "${q}".`,
  },

  modules: {
    title: "Modules",
    subtitle: "your path to an AI workforce",
    intro:
      "The build path, in order. Get Claude Code running, build the brain everything reads from, then hire your AI employees from the map and stand up your command centers. 3 modules live, 18 lessons.",
    moreDrop: "More modules drop as your workforce grows.",
    lessons: (n: number) => `${n} lessons`,
    startModule: "Start",
    resumeModule: "Resume",
    yourWorkforce: "Your workforce",
    // Detail-page chrome (Pkg10 · N5)
    moduleEyebrow: (n: string) => `MODULE ${n}`,
    walkAway: "You'll walk away with",
    lessonsComplete: (done: number, total: number) => `${done}/${total} lessons complete`,
    lessonDone: "Done",
    nextModule: "Next module",
    previous: "Previous",
    exploreMap: "Explore the map",
    backAll: "All modules",
  },

  drops: {
    title: "Drops",
    sub: "every skill, newest first · a new one lands each week",
    back: "Back to hub",
    footer: "New skills drop every week.",
  },

  modals: {
    login: {
      members: "Members",
      logIn: "Log in",
      email: "Email",
      password: "Password",
      emailPlaceholder: "you@company.com",
      signingIn: "Signing in…",
      welcomeBack: "Welcome back",
    },
    paywall: {
      unlock1: "Runnable skill files — copy the install command for any job",
      unlock2: "The 10-minute brain interview that writes your context",
      unlock3: "Install skills into My tree and light up your map",
      foundingCohort: "Founding cohort",
      joinCohort: "Join the founding cohort",
      seats: "100 seats · $49/mo locked for life",
      checkout: "Continue to checkout →",
      alreadyMember: "Already a member? Log in",
      welcomeToCohort: "Welcome to the cohort",
    },
    signInNotConfigured: "Sign-in is not configured in this environment.",
  },

  capacitacoes: {
    title: "AI University",
    subtitle: "your operation, taught as courses",
    intro:
      "Every department, module and function of the tree — packaged as watchable training. Pick up where you stopped, or start from the top of the ranking.",
    continueWatching: "Continue watching",
    topNine: (n: number) => `Top ${n} courses in Brazil`,
    series: "Series",
    mightLike: "Courses you might like",
    comingSoon: "Coming soon",
    lesson: (n: number) => `Lesson ${n}`,
    functionsCount: (n: number) => `${n} functions`,
    jobsCount: (n: number) => `${n} jobs`,
    coursePill: "Course",
    comingSoonPill: "Coming soon",
    modulePill: "Module",
    departmentPill: "Department",
    scrollLeft: "Scroll left",
    scrollRight: "Scroll right",
    // course (modules) page + lesson page (Pkg capacitacoes-modulos-aula)
    moduleN: (n: number) => `Track ${n}`,
    modulesCount: (n: number) => `${n} track${n === 1 ? "" : "s"}`,
    lessonsCount: (n: number) => `${n} lesson${n === 1 ? "" : "s"}`,
    minutesShort: (n: number) => `${n} min`,
    continueCta: (m: number, l: number, title: string) => `Continue T${m} L${l} — ${title}`,
    courses: "AI University",
    watched: "watched",
    remaining: "remaining",
    lessonsInModule: "Lessons in this track",
    aboutLesson: "About this lesson",
    upNext: "Up next",
    playDemo: "Preview — demo player",
    backToCourse: "Back to course",
    backToCourses: "Back to AI University",
    comingSoonTitle: "This course is coming soon",
    comingSoonBody:
      "The training is already in the catalog. Tracks and lessons will be released as soon as the content is ready.",
    completed: "Completed",
    modulesTab: "Tracks",
    filesTab: "Course files",
    lessonsTab: "Lessons",
    annotationsTab: "Notes",
    annotationsEmpty: "Your notes for this lesson will appear here.",
    lessonFiles: "Lesson files",
    filesCount: (n: number) => `${n} file${n === 1 ? "" : "s"}`,
    like: "Like",
    dislike: "Dislike",
    save: "Save",
    share: "Share",
    prevLesson: "Previous lesson",
    nextLesson: "Next lesson",
    networking: "Networking space",
    commentsCount: (n: number) => `${n} comment${n === 1 ? "" : "s"}`,
    writeComment: "Add a comment…",
    publish: "Publish",
    beFirst: "Be the first to comment on this lesson.",
    reply: "Reply",
    memberYou: "You",
    memberAnon: "A member",
    notesPlaceholder: "Type your notes here…",
    saveNote: "Save note",
    notesSaved: "Saved notes",
    materialsTab: "Materials",
    skillFile: "skill file",
    markComplete: "Mark complete",
    markedComplete: "Lesson completed",
    rateLabel: "Rate this lesson",
    openMaterial: "Open",
    locked: "Locked",
    releaseInDays: (n: number) => `Unlocks in ${n} day${n === 1 ? "" : "s"}`,
    notInPlan: "Not included in your plan",
  },

  // Command palette (Pkg15 · Feature A)
  palette: {
    placeholder: "Search skills, modules, lessons, departments…",
    esc: "esc",
    empty: (q: string) => `No matches for "${q}"`,
    nav: {
      homeTitle: "Home",
      homeSub: "The map · every job",
      hubTitle: "Hub",
      hubSub: "Drops, community, dashboard",
      modulesTitle: "Modules",
      modulesSub: "The build path · your progress",
      treeTitle: "My Tree",
      treeSub: "Skills you've installed",
      brainTitle: "Brain",
      brainSub: "Your company brain",
    },
    tag: { go: "Go", map: "Map", dashboard: "Dashboard", lesson: "Lesson" },
    sub: {
      department: "Department · jump to it on the map",
      lesson: "Lesson",
    },
  },

  // Member settings (Pkg15 · Feature B)
  settings: {
    title: "Settings",
    photo: {
      head: "Profile photo",
      initials: "CO",
      upload: "Upload photo",
      hint: "PNG, JPG or WEBP · up to 2MB",
    },
    account: {
      head: "Account",
      emailLabel: "Email",
      email: "contato@thiagofinch.com",
    },
    password: {
      head: "Password",
      label: "Password",
      hint: "Confirm your current password and choose a new password with at least 6 characters.",
      placeholder: "New password (8+ characters)",
      save: "Save",
      saved: "Password saved",
    },
    billing: {
      head: "Billing",
      hint: "Billing is not connected in this Arkom environment yet.",
      button: "Billing unavailable",
      toast: "Billing is not available yet",
    },
    logout: {
      head: "Log out",
      hint: "Sign out of Arkom on this device. Sign in again with your email and password.",
      button: "Log out",
      toast: "Signed out",
    },
    note: "You can always log in with a magic link. A password is just a faster option if you want one.",
  },

  inicio: {
    goodMorning: "Good morning",
    goodAfternoon: "Good afternoon",
    goodEvening: "Good evening",
    memberName: "Member",
    heroSub: "Your AI track continues here. Pick up where you left off and keep the pace.",
    kpiOngoing: "Ongoing",
    kpiOngoingSub: (n: number) => `course${n === 1 ? "" : "s"}`,
    kpiDone: "Lessons completed",
    kpiDoneSub: "in total",
    kpiAvg: "Average progress",
    kpiAvgSub: "of active courses",
    kpiMent: "Upcoming mentorships",
    kpiMentSub: "scheduled",
    continuePill: "Continue where you left off",
    onboardingPill: "Start here",
    onboardingTitle: "Build your second brain",
    onboardingDesc: "Your first step: the interview that writes your company's context — every agent and solution learns from it.",
    onboardingCta: "Start now",
    lessonsOf: (a: number, b: number) => `${a} of ${b} lessons completed`,
    continueCta: "Continue watching",
    nextMentorships: "Upcoming mentorships",
    nextMentorship: "Next mentorship",
    calendarLink: "Calendar",
    yourProgress: "Your progress",
    seeTraining: "See training",
    progressSub: "Unlocked courses you already started",
    featured: "Featured solutions",
    seeAll: "See all",
    featuredSub: "The apps and templates the community uses most",
    lastAccess: "Recent activity",
    lastAccessSub: "Where you've been on the platform",
    agoHours: (n: number) => `about ${n} hour${n === 1 ? "" : "s"} ago`,
    pillCourse: "Course",
    pillApp: "App",
  },

  solucoes: {
    eyebrow: "ARKOM OS · CONNECTED SOLUTIONS",
    title: "Every solution, one machine.",
    sub: "Agents, dashboards and automations orbiting a single core. Click a solution to see its lesson and access.",
    core: "Core",
    coreOnline: (a: number, b: number) => `${a}/${b} solutions online`,
    yourWorkspace: "Your Workspace",
    comingSoon: "Coming soon",
    live: "Online",
    footer: (n: number, c: number) => `${n} solutions · ${c} categories · uptime 99.9% · method the machine`,
    seeLesson: "See the lesson",
    remix: "Remix solution",
    terminal: "~/arkom/solutions · live",
  },

  apps: {
    title: "Systems",
    sub: "Tools, automations and ready templates to accelerate your business.",
    all: "All",
    catAgentes: "Agents",
    catDashboards: "Dashboards",
    catAutomacao: "Automation",
    access: "Access",
    details: "View details",
    soon: "Coming soon",
  },

  mentorias: {
    title: "Mentorships",
    sub: "Follow the live mentorship agenda, check each session and confirm your spot.",
    today: "Today",
    monthly: "Monthly",
    weekly: "Weekly",
    daily: "Daily",
    more: (n: number) => `+${n} more`,
    empty: "No sessions in this period.",
    confirmed: "Confirmed",
    access: "Access session",
    accessLockedTitle: "Confirm your attendance first",
    accessLockedHint:
      "Access to the session unlocks as soon as you confirm your attendance.",
    accessEarlyTitle: "It's not time yet",
    accessEarlyHint: (min: number, hora: string, dia: string) =>
      `Your attendance is confirmed. The room opens ${min} minutes before it starts — from ${hora} on ${dia}.`,
    confirm: "Confirm attendance",
    confirmedCta: "Attendance confirmed",
    saving: "Saving…",
    undoHint: "Click to undo your confirmation",
    confirmedBanner: "Your spot is confirmed. Click the button below to undo.",
    toastConfirmed: "Attendance confirmed!",
    toastConfirmedSub: "See you at the mentorship. Enjoy!",
    toastRemoved: "Attendance confirmation removed.",
    toastError: "Could not update your attendance.",
    ended: "Mentorship ended",
    endedBanner:
      "This mentorship has already happened. Attendance confirmation and access are available until the event's end time.",
    creditCost: (n: number) => `Uses ${n}h of your plan`,
    creditFree: "Doesn't use plan hours",
    creditBalance: (n: number) => `Your balance: ${n}h of mentorship`,
    creditUnlimited: "Your plan includes unlimited mentorship hours",
    // Contador do cabeçalho (saldo/cota, referência "PLANO 8/8").
    planBadge: "Plan",
    planBadgeUnlimited: "Unlimited",
    creditInsufficient: "You don't have enough hours to confirm this mentorship.",
    // Mentores (Tarefa 2) — só aparecem com `mentors_enabled` ligada.
    mentorsTitle: "Who runs the mentorships",
    mentorsSub: "The Arkom mentors leading the live sessions.",
    mentorsOnEvent: "Mentors",
    mentorOpen: (name: string) => `See ${name}'s profile`,
    mentorNext: "Next sessions",
    mentorNoNext: "No sessions scheduled right now.",
    mentorNoBio: "Profile coming soon.",
  },
} satisfies Dict;

/** The dictionary shape — pt.ts must satisfy it exactly (compile-time parity). */
export type Dict = {
  common: { close: string; dismiss: string; done: string; back: string; next: string; toggleFullscreen: string; clearSearch: string; searchJobs: string };
  shell: {
    nav: { inicio: string; map: string; hub: string; modules: string; myTree: string; brain: string; capacitacoes: string; mentorias: string; solucoes: string; apps: string; community: string; myAccount: string; support: string };
    workspace: string;
    demo: string;
    free: string;
    pro: string;
    logout: string;
    memberSettings: string;
    lightMode: string;
    darkMode: string;
    openMenu: string;
    closeMenu: string;
    toggleTheme: string;
    togglePlan: (plan: string) => string;
    language: string;
    toggleLanguage: string;
  };
  hub: {
    skillsLive: (n: number) => string;
    catchUp: string;
    onTheList: (n: string) => string;
    openTheMap: string;
    modules: string;
    modulesSub: string;
    allModules: string;
    freshDrops: string;
    newestSub: string;
    seeAll: (n: number) => string;
    liveFooter: string;
    installs: (n: number) => string;
    searchPlaceholder: string;
    passwordPre: string;
    passwordLink: string;
    passwordPost: string;
    dismiss: string;
    getStarted: {
      eyebrow: string;
      memberTitle: string;
      freeTitle: string;
      done: string;
      s1t: string;
      s1s: string;
      s2t: string;
      s2s: string;
      s3t: string;
      s3s: string;
      s4t: string;
      s4s: string;
      s5t: string;
      s5s: string;
      installGuide: string;
      alreadyHaveIt: string;
      seeMcps: string;
      alreadyConnected: string;
      openBrain: string;
      starterClaudeMd: string;
      freePickTitle: string;
      freePickSub: string;
    };
    cards: {
      install: string;
      installed: string;
      featuredEyebrow: string;
      installSkill: string;
      mostInstalled: string;
      allTime: string;
      buildLogs: string;
      from: (author: string) => string;
      nextDrop: string;
      lands: (when: string) => string;
      installedToast: (title: string) => string;
      communityPulse: string;
      live: string;
      memberInstalled: string;
      memberBuiltBrain: string;
      hoursAgo: (n: number) => string;
    };
    reader: {
      sub: (dept: string) => string;
      installLabel: string;
      copy: string;
      copied: string;
      footRunPre: string;
      footRunPost: string;
      downloadFile: string;
      seeOnMap: string;
    };
    stats: {
      installed: string;
      runs: string;
      streakPrefix: string;
      streakValue: string;
      streakSuffix: string;
      myTree: string;
    };
  };
  map: {
    tabs: { map: string; dash: string; chart: string };
    bookCall: string;
    searchPlaceholder: string;
    aboutMap: string;
    backToDepts: string;
    zoomOut: string;
    zoomIn: string;
    fit: string;
    levelLabel: { autonomous: string; assisted: string; led: string };
    nodeZero: {
      knowledgeBase: string;
      subtitle: string;
      title: string;
      badge: string;
      hubLine: string;
      doctrineLabel: string;
      readingLabel: string;
      auditLabel: string;
      drawer: {
        beforeEverything: string;
        desc: string;
        shipsFiles: string;
        shipsWith: string;
        preview: string;
        whatLivesIn: string;
        whatItReplaces: string;
        whatItReplacesBody: string;
        ladder: string;
        ladderLed: string;
        ladderAssisted: string;
        ladderAutonomous: string;
        human: string;
        humanBody: string;
        buildNotes: string;
        buildNotesBody: string;
        skillsRead: string;
        skillsLocked: string;
        readSkillMd: string;
        lockedTap: string;
        skillDescNode: string;
        skillDescAudit: string;
        unlockCta: string;
        needHelp: string;
      };
    };
  };
  chart: {
    subtitle: string;
    rolloutLine: (auto: number, assisted: number) => string;
    rolloutBold: (auto: number, total: number) => string;
    rolloutMid: string;
    assistedBold: (n: number) => string;
    rolloutEnd: string;
    jobsWord: string;
    rolloutOrder: string;
    first: string;
    last: string;
    legend: { led: string; assisted: string; autonomous: string };
    stages: { foundation: string; capture: string; generate: string; orchestrate: string };
    stageSub: { foundation: string; capture: string; generate: string; orchestrate: string };
    drawer: {
      moreDetail: string;
      whyHuman: string;
      replaces: string;
      ladder: string;
      ongoing: string;
      noJobs: string;
      whatItDoes: string;
      skills: string;
      tools: string;
      now: string;
      replacesBody: string;
      noSkillManual: string;
      skillInProgress: string;
      noTools: string;
      bookCall: string;
      partOfRollout: (dept: string) => string;
    };
  };
  dash: {
    searchPanels: string;
    timeRange: string;
    guide: {
      membersOnly: string;
      unlock: string;
      finePrint: string;
      eyebrow: string;
      intro: (tool: string) => string;
      setup: (tool: string, time: string) => string;
      howItConnects: string;
      unlockPrompt: string;
      membership: string;
    };
    bookCall: string;
  };
  brain: {
    title: string;
    tagline: string;
    intro: string;
    buildYourBrain: string;
    buildYourBrainBody: string;
    openModule: string;
    starterClaudeMd: string;
    whatLives: string;
    stepOf: (n: number, total: number) => string;
    estTime: string;
    buildMyBrain: string;
    builtToast: string;
    stepTitles: {
      whatYouDo: string;
      whatYouSell: string;
      whoYouServe: string;
      voiceTone: string;
      goals: string;
      toolsStack: string;
      channels: string;
      review: string;
    };
    channels: { outbound: string; inbound: string; paid: string; partners: string; community: string };
    voiceExamples: { direct: string; warm: string; bold: string; expert: string };
    fields: {
      doLabel: string;
      doPlaceholder: string;
      sellLabel: string;
      sellPlaceholder: string;
      priceLabel: string;
      pricePlaceholder: string;
      icpLabel: string;
      icpPlaceholder: string;
      voiceLabel: string;
      voicePlaceholder: string;
      goalsLabel: string;
      goalsPlaceholder: string;
      toolsLabel: string;
      toolsOtherPlaceholder: string;
      channelsLabel: string;
      reviewIntro: string;
      goalsReview: string;
      notAnswered: string;
    };
    pillars: {
      voiceTitle: string;
      fromYourBrain: string;
      doDesc: string;
      sellDesc: string;
      icpDesc: string;
      voiceDesc: string;
    };
    card: {
      resume: string;
      build: string;
      body: string;
      voiceToast: string;
      talk: string;
      reviewAnswers: string;
      resumeShort: string;
      typeMyself: string;
      draftAi: string;
      freeTitle: string;
      freeBody: string;
      unlockPro: string;
    };
    listening: string;
    drafting: string;
    continueCta: string;
    buildBrainCta: string;
    saving: string;
    skip: string;
    copyCmd: string;
    copied: string;
    fillToContinue: string;
  };
  tree: {
    installed: string;
    brain: string;
    built: string;
    soon: string;
    streak: string;
    memberSince: string;
    findMore: string;
    title: string;
    titleSub: string;
    findMoreShort: string;
    yourTree: string;
    nInstalled: (n: number) => string;
    removeAria: (name: string) => string;
    installedToast: (name: string) => string;
    empty: string;
    emptyPre: string;
    emptyLink: string;
    emptyPost: string;
    findMoreSub: string;
    searchSkills: string;
    install: string;
    noMatch: (q: string) => string;
  };
  modules: {
    title: string;
    subtitle: string;
    intro: string;
    moreDrop: string;
    lessons: (n: number) => string;
    startModule: string;
    resumeModule: string;
    yourWorkforce: string;
    moduleEyebrow: (n: string) => string;
    walkAway: string;
    lessonsComplete: (done: number, total: number) => string;
    lessonDone: string;
    nextModule: string;
    previous: string;
    exploreMap: string;
    backAll: string;
  };
  drops: {
    title: string;
    sub: string;
    back: string;
    footer: string;
  };
  modals: {
    login: {
      members: string;
      logIn: string;
      email: string;
      password: string;
      emailPlaceholder: string;
      signingIn: string;
      welcomeBack: string;
    };
    paywall: {
      unlock1: string;
      unlock2: string;
      unlock3: string;
      foundingCohort: string;
      joinCohort: string;
      seats: string;
      checkout: string;
      alreadyMember: string;
      welcomeToCohort: string;
    };
    signInNotConfigured: string;
  };
  capacitacoes: {
    title: string;
    subtitle: string;
    intro: string;
    continueWatching: string;
    topNine: (n: number) => string;
    series: string;
    mightLike: string;
    comingSoon: string;
    lesson: (n: number) => string;
    functionsCount: (n: number) => string;
    jobsCount: (n: number) => string;
    coursePill: string;
    comingSoonPill: string;
    modulePill: string;
    departmentPill: string;
    scrollLeft: string;
    scrollRight: string;
    moduleN: (n: number) => string;
    modulesCount: (n: number) => string;
    lessonsCount: (n: number) => string;
    minutesShort: (n: number) => string;
    continueCta: (m: number, l: number, title: string) => string;
    courses: string;
    watched: string;
    remaining: string;
    lessonsInModule: string;
    aboutLesson: string;
    upNext: string;
    playDemo: string;
    backToCourse: string;
    backToCourses: string;
    comingSoonTitle: string;
    comingSoonBody: string;
    completed: string;
    modulesTab: string;
    filesTab: string;
    lessonsTab: string;
    annotationsTab: string;
    annotationsEmpty: string;
    lessonFiles: string;
    filesCount: (n: number) => string;
    like: string;
    dislike: string;
    save: string;
    share: string;
    prevLesson: string;
    nextLesson: string;
    networking: string;
    commentsCount: (n: number) => string;
    writeComment: string;
    publish: string;
    beFirst: string;
    reply: string;
    memberYou: string;
    memberAnon: string;
    notesPlaceholder: string;
    saveNote: string;
    notesSaved: string;
    materialsTab: string;
    skillFile: string;
    markComplete: string;
    markedComplete: string;
    rateLabel: string;
    openMaterial: string;
    locked: string;
    releaseInDays: (n: number) => string;
    notInPlan: string;
  };
  palette: {
    placeholder: string;
    esc: string;
    empty: (q: string) => string;
    nav: {
      homeTitle: string;
      homeSub: string;
      hubTitle: string;
      hubSub: string;
      modulesTitle: string;
      modulesSub: string;
      treeTitle: string;
      treeSub: string;
      brainTitle: string;
      brainSub: string;
    };
    tag: { go: string; map: string; dashboard: string; lesson: string };
    sub: { department: string; lesson: string };
  };
  settings: {
    title: string;
    photo: { head: string; initials: string; upload: string; hint: string };
    account: {
      head: string;
      emailLabel: string;
      email: string;
    };
    password: {
      head: string;
      label: string;
      hint: string;
      placeholder: string;
      save: string;
      saved: string;
    };
    billing: { head: string; hint: string; button: string; toast: string };
    logout: { head: string; hint: string; button: string; toast: string };
    note: string;
  };
  inicio: {
    goodMorning: string; goodAfternoon: string; goodEvening: string; memberName: string;
    heroSub: string;
    kpiOngoing: string; kpiOngoingSub: (n: number) => string; kpiDone: string; kpiDoneSub: string;
    kpiAvg: string; kpiAvgSub: string; kpiMent: string; kpiMentSub: string;
    continuePill: string; onboardingPill: string; onboardingTitle: string; onboardingDesc: string; onboardingCta: string;
    lessonsOf: (a: number, b: number) => string; continueCta: string;
    nextMentorships: string; nextMentorship: string; calendarLink: string;
    yourProgress: string; seeTraining: string; progressSub: string;
    featured: string; seeAll: string; featuredSub: string;
    lastAccess: string; lastAccessSub: string; agoHours: (n: number) => string;
    pillCourse: string; pillApp: string;
  };
  solucoes: {
    eyebrow: string; title: string; sub: string; core: string;
    coreOnline: (a: number, b: number) => string; yourWorkspace: string;
    comingSoon: string; live: string; footer: (n: number, c: number) => string;
    seeLesson: string; remix: string; terminal: string;
  };
  apps: {
    title: string; sub: string; all: string;
    catAgentes: string; catDashboards: string; catAutomacao: string;
    access: string; details: string; soon: string;
  };
  mentorias: {
    title: string; sub: string; today: string;
    monthly: string; weekly: string; daily: string;
    more: (n: number) => string; empty: string; confirmed: string;
    access: string; accessLockedTitle: string; accessLockedHint: string;
    accessEarlyTitle: string;
    accessEarlyHint: (min: number, hora: string, dia: string) => string;
    confirm: string; confirmedCta: string; saving: string;
    undoHint: string; confirmedBanner: string;
    toastConfirmed: string; toastConfirmedSub: string;
    toastRemoved: string; toastError: string;
    ended: string; endedBanner: string;
    creditCost: (n: number) => string; creditFree: string;
    creditBalance: (n: number) => string; creditUnlimited: string;
    planBadge: string; planBadgeUnlimited: string;
    creditInsufficient: string;
    mentorsTitle: string; mentorsSub: string; mentorsOnEvent: string;
    mentorOpen: (name: string) => string;
    mentorNext: string; mentorNoNext: string; mentorNoBio: string;
  };
};

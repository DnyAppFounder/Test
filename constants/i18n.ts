export type Language = 'en' | 'fr' | 'es' | 'de' | 'pt' | 'zh' | 'ja' | 'ko' | 'ar' | 'tr';

export const languageNames: Record<Language, string> = {
  en: 'English',
  fr: 'Francais',
  es: 'Espanol',
  de: 'Deutsch',
  pt: 'Portugues',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  tr: 'Turkish',
};

type TranslationKeys = {
  tabs: {
    wallet: string;
    community: string;
    gaming: string;
    dapps: string;
    settings: string;
  };
  wallet: {
    totalBalance: string;
    send: string;
    receive: string;
    buy: string;
    tokens: string;
    searchTokens: string;
    price: string;
    change24h: string;
    volume: string;
    marketCap: string;
    myAssets: string;
    market: string;
    profile: string;
    trending: string;
    gainers: string;
    losers: string;
    newListings: string;
    mostViewed: string;
  };
  community: {
    feed: string;
    newPost: string;
    createPost: string;
    whatsOnYourMind: string;
    post: string;
    promoted: string;
    promotedTag: string;
    promotePost: string;
    likes: string;
    comments: string;
    reposts: string;
    repost: string;
    profile: string;
    editProfile: string;
    posts: string;
    followers: string;
    following: string;
    follow: string;
    unfollow: string;
    holdTokenToPost: string;
    addComment: string;
    promoteDurations: {
      hour1: string;
      hours10: string;
      hours24: string;
      week1: string;
    };
  };
  gaming: {
    mysteryBox: string;
    teamBattle: string;
    selectBox: string;
    openBox: string;
    reward: string;
    common: string;
    rare: string;
    epic: string;
    legendary: string;
    createTeam: string;
    joinTeam: string;
    prizePool: string;
    entryFee: string;
    teamOf3: string;
    waitingForPlayers: string;
    matchInProgress: string;
    winner: string;
    youWon: string;
    skillTournament: string;
    disclaimer: string;
  };
  settings: {
    title: string;
    preferences: string;
    language: string;
    manageAccounts: string;
    inviteFriends: string;
    helpSupport: string;
    assistant: string;
    profile: string;
    security: string;
    notifications: string;
    about: string;
    logout: string;
    darkMode: string;
    biometric: string;
    recoveryPhrase: string;
    version: string;
  };
  common: {
    loading: string;
    error: string;
    retry: string;
    cancel: string;
    confirm: string;
    save: string;
    delete: string;
    back: string;
    next: string;
    done: string;
    search: string;
    noResults: string;
    seeAll: string;
  };
};

const en: TranslationKeys = {
  tabs: {
    wallet: 'Wallet',
    community: 'Community',
    gaming: 'Gaming',
    dapps: 'dApps',
    settings: 'Settings',
  },
  wallet: {
    totalBalance: 'Total Balance',
    send: 'Send',
    receive: 'Receive',
    buy: 'Buy',
    tokens: 'Tokens',
    searchTokens: 'Search tokens...',
    price: 'Price',
    change24h: '24h Change',
    volume: 'Volume',
    marketCap: 'Market Cap',
    myAssets: 'My Assets',
    market: 'Market',
    profile: 'Profile',
    trending: 'Trending',
    gainers: 'Gainers',
    losers: 'Losers',
    newListings: 'New',
    mostViewed: 'Most Viewed',
  },
  community: {
    feed: 'Community',
    newPost: 'New Post',
    createPost: 'Create Post',
    whatsOnYourMind: "What's on your mind?",
    post: 'Post',
    promoted: 'Promoted',
    promotedTag: 'Promoted',
    promotePost: 'Promote Post',
    likes: 'Likes',
    comments: 'Comments',
    reposts: 'Reposts',
    repost: 'Repost',
    profile: 'Profile',
    editProfile: 'Edit Profile',
    posts: 'Posts',
    followers: 'Followers',
    following: 'Following',
    follow: 'Follow',
    unfollow: 'Unfollow',
    holdTokenToPost: 'Hold app tokens to unlock posting',
    addComment: 'Add a comment...',
    promoteDurations: {
      hour1: '1 Hour',
      hours10: '10 Hours',
      hours24: '24 Hours',
      week1: '1 Week',
    },
  },
  gaming: {
    mysteryBox: 'Mystery Box',
    teamBattle: 'Team Battle',
    selectBox: 'Select a Box',
    openBox: 'Open Box',
    reward: 'Reward',
    common: 'Common',
    rare: 'Rare',
    epic: 'Epic',
    legendary: 'Legendary',
    createTeam: 'Create Team',
    joinTeam: 'Join Team',
    prizePool: 'Prize Pool',
    entryFee: 'Entry Fee',
    teamOf3: 'Team of 3',
    waitingForPlayers: 'Waiting for players...',
    matchInProgress: 'Match in progress',
    winner: 'Winner',
    youWon: 'You won!',
    skillTournament: 'Skill Tournament',
    disclaimer: 'This is a skill-based tournament. No real-money gambling. Results based on performance metrics. Must be 18+. Review terms before participating.',
  },
  settings: {
    title: 'Settings',
    preferences: 'Preferences',
    language: 'Language',
    manageAccounts: 'Manage Accounts',
    inviteFriends: 'Invite Friends',
    helpSupport: 'Help & Support',
    assistant: 'Assistant',
    profile: 'Profile',
    security: 'Security',
    notifications: 'Notifications',
    about: 'About',
    logout: 'Log Out',
    darkMode: 'Dark Mode',
    biometric: 'Biometric Auth',
    recoveryPhrase: 'Recovery Phrase',
    version: 'Version',
  },
  common: {
    loading: 'Loading...',
    error: 'Something went wrong',
    retry: 'Retry',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    delete: 'Delete',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    search: 'Search',
    noResults: 'No results found',
    seeAll: 'See All',
  },
};

const fr: TranslationKeys = {
  tabs: {
    wallet: 'Portefeuille',
    community: 'Communaute',
    gaming: 'Jeux',
    dapps: 'dApps',
    settings: 'Parametres',
  },
  wallet: {
    totalBalance: 'Solde total',
    send: 'Envoyer',
    receive: 'Recevoir',
    buy: 'Acheter',
    tokens: 'Jetons',
    searchTokens: 'Rechercher des jetons...',
    price: 'Prix',
    change24h: 'Variation 24h',
    volume: 'Volume',
    marketCap: 'Cap. marche',
    myAssets: 'Mes actifs',
    market: 'Marche',
    profile: 'Profil',
    trending: 'Tendances',
    gainers: 'Hausse',
    losers: 'Baisse',
    newListings: 'Nouveau',
    mostViewed: 'Plus vus',
  },
  community: {
    feed: 'Communaute',
    newPost: 'Nouveau post',
    createPost: 'Creer un post',
    whatsOnYourMind: 'A quoi pensez-vous?',
    post: 'Publier',
    promoted: 'Promu',
    promotedTag: 'Promu',
    promotePost: 'Promouvoir',
    likes: 'Likes',
    comments: 'Commentaires',
    reposts: 'Repartages',
    repost: 'Repartager',
    profile: 'Profil',
    editProfile: 'Modifier le profil',
    posts: 'Posts',
    followers: 'Abonnes',
    following: 'Abonnements',
    follow: 'Suivre',
    unfollow: 'Ne plus suivre',
    holdTokenToPost: 'Detenez des jetons pour publier',
    addComment: 'Ajouter un commentaire...',
    promoteDurations: {
      hour1: '1 heure',
      hours10: '10 heures',
      hours24: '24 heures',
      week1: '1 semaine',
    },
  },
  gaming: {
    mysteryBox: 'Boite mystere',
    teamBattle: 'Bataille equipe',
    selectBox: 'Choisir une boite',
    openBox: 'Ouvrir',
    reward: 'Recompense',
    common: 'Commun',
    rare: 'Rare',
    epic: 'Epique',
    legendary: 'Legendaire',
    createTeam: 'Creer equipe',
    joinTeam: 'Rejoindre',
    prizePool: 'Cagnotte',
    entryFee: 'Mise',
    teamOf3: 'Equipe de 3',
    waitingForPlayers: 'En attente...',
    matchInProgress: 'Match en cours',
    winner: 'Gagnant',
    youWon: 'Vous avez gagne!',
    skillTournament: 'Tournoi de competences',
    disclaimer: 'Tournoi base sur les competences. Pas de jeu d\'argent. Resultats bases sur la performance. 18+ requis.',
  },
  settings: {
    title: 'Parametres',
    preferences: 'Preferences',
    language: 'Langue',
    manageAccounts: 'Gerer les comptes',
    inviteFriends: 'Inviter des amis',
    helpSupport: 'Aide et support',
    assistant: 'Assistant',
    profile: 'Profil',
    security: 'Securite',
    notifications: 'Notifications',
    about: 'A propos',
    logout: 'Deconnexion',
    darkMode: 'Mode sombre',
    biometric: 'Auth biometrique',
    recoveryPhrase: 'Phrase de recuperation',
    version: 'Version',
  },
  common: {
    loading: 'Chargement...',
    error: 'Quelque chose a mal tourne',
    retry: 'Reessayer',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    save: 'Enregistrer',
    delete: 'Supprimer',
    back: 'Retour',
    next: 'Suivant',
    done: 'Termine',
    search: 'Rechercher',
    noResults: 'Aucun resultat',
    seeAll: 'Voir tout',
  },
};

const translations: Record<Language, TranslationKeys> = {
  en,
  fr,
  es: en,
  de: en,
  pt: en,
  zh: en,
  ja: en,
  ko: en,
  ar: en,
  tr: en,
};

export function getTranslations(lang: Language): TranslationKeys {
  return translations[lang] || en;
}

export const defaultLanguage: Language = 'en';

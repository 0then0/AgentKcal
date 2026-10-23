window.AgentKcalFoods = (() => {
  // Generic comparison portions, not product endorsements. Sources and mass
  // assumptions are documented in docs/methodology.md. All energy is per 100 g.
  const items: Food[] = [
    {
      id: "buckwheat",
      title: "Buckwheat",
      portion: "800 g dry grain",
      grams: 800,
      kcalPer100g: 335,
      units: {
        en: {
          one: "pack of buckwheat",
          other: "packs of buckwheat",
        },
        ru: {
          one: "пачка гречки",
          few: "пачки гречки",
          many: "пачек гречки",
          other: "пачки гречки",
        },
        es: {
          one: "paquete de trigo sarraceno",
          other: "paquetes de trigo sarraceno",
        },
        de: {
          one: "Packung Buchweizen",
          other: "Packungen Buchweizen",
        },
        fr: {
          one: "paquet de sarrasin",
          other: "paquets de sarrasin",
        },
        ja: {
          one: "袋（そばの実）",
          other: "袋（そばの実）",
        },
        "pt-BR": {
          one: "pacote de trigo-sarraceno",
          other: "pacotes de trigo-sarraceno",
        },
      },
    },
    {
      id: "dumpling",
      title: "Dumplings",
      portion: "15 g per frozen dumpling",
      grams: 15,
      kcalPer100g: 270,
      units: {
        en: {
          one: "dumpling",
          other: "dumplings",
        },
        ru: {
          one: "пельмень",
          few: "пельменя",
          many: "пельменей",
          other: "пельменя",
        },
        es: {
          one: "unidad de pelmeni",
          other: "unidades de pelmeni",
        },
        de: {
          one: "Pelmeni",
          other: "Pelmeni",
        },
        fr: {
          one: "pièce de pelmeni",
          other: "pièces de pelmeni",
        },
        ja: {
          one: "個（ペリメニ）",
          other: "個（ペリメニ）",
        },
        "pt-BR": {
          one: "unidade de pelmeni",
          other: "unidades de pelmeni",
        },
      },
    },
    {
      id: "bread",
      title: "Bread",
      portion: "400 g white loaf",
      grams: 400,
      kcalPer100g: 265,
      units: {
        en: {
          one: "loaf of bread",
          other: "loaves of bread",
        },
        ru: {
          one: "батон",
          few: "батона",
          many: "батонов",
          other: "батона",
        },
        es: {
          one: "barra de pan",
          other: "barras de pan",
        },
        de: {
          one: "Laib Brot",
          other: "Laibe Brot",
        },
        fr: {
          one: "pain",
          other: "pains",
        },
        ja: {
          one: "個（白パン）",
          other: "個（白パン）",
        },
        "pt-BR": {
          one: "pão",
          other: "pães",
        },
      },
    },
    {
      id: "milk",
      title: "Milk",
      portion: "1 kg of 3.2% milk",
      grams: 1000,
      kcalPer100g: 59,
      units: {
        en: {
          one: "carton of milk",
          other: "cartons of milk",
        },
        ru: {
          one: "пакет молока",
          few: "пакета молока",
          many: "пакетов молока",
          other: "пакета молока",
        },
        es: {
          one: "cartón de leche",
          other: "cartones de leche",
        },
        de: {
          one: "Packung Milch",
          other: "Packungen Milch",
        },
        fr: {
          one: "brique de lait",
          other: "briques de lait",
        },
        ja: {
          one: "パック（牛乳）",
          other: "パック（牛乳）",
        },
        "pt-BR": {
          one: "caixa de leite",
          other: "caixas de leite",
        },
      },
    },
    {
      id: "banana",
      title: "Bananas",
      portion: "118 g edible banana, without peel",
      grams: 118,
      kcalPer100g: 89,
      units: {
        en: {
          one: "banana",
          other: "bananas",
        },
        ru: {
          one: "банан",
          few: "банана",
          many: "бананов",
          other: "банана",
        },
        es: {
          one: "plátano",
          other: "plátanos",
        },
        de: {
          one: "Banane",
          other: "Bananen",
        },
        fr: {
          one: "banane",
          other: "bananes",
        },
        ja: {
          one: "本（バナナ）",
          other: "本（バナナ）",
        },
        "pt-BR": {
          one: "banana",
          other: "bananas",
        },
      },
    },
    {
      id: "rice",
      title: "Rice",
      portion: "800 g dry white rice",
      grams: 800,
      kcalPer100g: 365,
      units: {
        en: {
          one: "pack of rice",
          other: "packs of rice",
        },
        ru: {
          one: "пачка риса",
          few: "пачки риса",
          many: "пачек риса",
          other: "пачки риса",
        },
        es: {
          one: "paquete de arroz",
          other: "paquetes de arroz",
        },
        de: {
          one: "Packung Reis",
          other: "Packungen Reis",
        },
        fr: {
          one: "paquet de riz",
          other: "paquets de riz",
        },
        ja: {
          one: "袋（米）",
          other: "袋（米）",
        },
        "pt-BR": {
          one: "pacote de arroz",
          other: "pacotes de arroz",
        },
      },
    },
    {
      id: "corn",
      title: "Corn",
      portion: "100 g raw sweet corn kernels per cob",
      grams: 100,
      kcalPer100g: 86,
      units: {
        en: {
          one: "cob of corn",
          other: "cobs of corn",
        },
        ru: {
          one: "початок кукурузы",
          few: "початка кукурузы",
          many: "початков кукурузы",
          other: "початка кукурузы",
        },
        es: {
          one: "mazorca de maíz",
          other: "mazorcas de maíz",
        },
        de: {
          one: "Maiskolben",
          other: "Maiskolben",
        },
        fr: {
          one: "épi de maïs",
          other: "épis de maïs",
        },
        ja: {
          one: "本（とうもろこし）",
          other: "本（とうもろこし）",
        },
        "pt-BR": {
          one: "espiga de milho",
          other: "espigas de milho",
        },
      },
    },
    {
      id: "potato",
      title: "Potatoes",
      portion: "150 g raw potato, including skin",
      grams: 150,
      kcalPer100g: 77,
      units: {
        en: {
          one: "potato",
          other: "potatoes",
        },
        ru: {
          one: "картофелина",
          few: "картофелины",
          many: "картофелин",
          other: "картофелины",
        },
        es: {
          one: "patata",
          other: "patatas",
        },
        de: {
          one: "Kartoffel",
          other: "Kartoffeln",
        },
        fr: {
          one: "pomme de terre",
          other: "pommes de terre",
        },
        ja: {
          one: "個（じゃがいも）",
          other: "個（じゃがいも）",
        },
        "pt-BR": {
          one: "batata",
          other: "batatas",
        },
      },
    },
  ];
  function equivalent(kcal: number, id: string): FoodEquivalent {
    const food = items.find((item) => item.id === id);
    if (!food) throw new RangeError("Unknown comparison food");
    if (!Number.isFinite(kcal) || kcal < 0)
      throw new RangeError("Energy must be finite and non-negative");
    const portionKcal = (food.grams * food.kcalPer100g) / 100;
    const raw = kcal / portionKcal;
    const nearest = Math.round(raw);
    // Avoid fractional-portion artifacts at integer boundaries without erasing
    // very small positive equivalents below the first portion.
    const quantity = nearest > 0 && Math.abs(raw - nearest) < 1e-12 ? nearest : raw;
    const whole = Math.floor(quantity);
    return {
      food,
      portionKcal,
      quantity,
      fraction: quantity - whole,
      icons: Array.from({ length: 5 }, (_, index) => Math.min(1, Math.max(0, quantity - index))),
      extra: Math.max(0, quantity - 5),
    };
  }
  function units(food: Food, quantity: number, language: Language): string {
    const forms = food.units[language] || food.units.en;
    // Grammar follows the displayed two-decimal quantity, not a hidden fraction.
    const displayed = quantity > 0 && quantity < 0.01 ? 0.01 : Number(quantity.toFixed(2));
    const category = new Intl.PluralRules(language).select(displayed);
    return forms[category] || forms.other;
  }
  return { items, equivalent, units };
})();

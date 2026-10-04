// Russian labels for the stat keys the party tree reports as percentages.
export const STAT_LABELS = {
  maxHp: 'Здоровье', maxMana: 'Мана', maxStamina: 'Выносливость',
  attack: 'Атака', defense: 'Защита', accuracy: 'Точность',
  evasion: 'Уклонение', speed: 'Скорость',
};

export const statLabel = (key) => STAT_LABELS[key] || key;

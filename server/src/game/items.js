// Items a hero can carry. Kept tiny for now: the only items in the world are
// the ritual's components and the trophies its boss drops. `ritual` marks the
// component the death-realm gate consumes.

export const ITEMS = {
  shepherd_key: {
    name: 'Ключ Пастыря',
    description: 'Костяной ключ, выломанный из руки пастуха. Отпирает врата в царство мёртвых.',
    ritual: true,
  },
  shepherd_crook: {
    name: 'Посох Пастыря',
    description: 'Трофей, снятый с владыки мёртвых. Помнит, как гнали стадо.',
    trophy: true,
  },
};

export const RITUAL_ITEM = 'shepherd_key';

export const itemInfo = (key) => ITEMS[key] || { name: key, description: '' };

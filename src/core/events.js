// Bus d'événements minimal : la simulation émet, le rendu, le son et l'interface écoutent.

export class Events {
  constructor() {
    this.handlers = new Map();
  }

  on(type, fn) {
    let list = this.handlers.get(type);
    if (!list) this.handlers.set(type, (list = []));
    list.push(fn);
    return () => list.splice(list.indexOf(fn), 1);
  }

  emit(type, data) {
    const list = this.handlers.get(type);
    if (list) for (const fn of list) fn(data);
  }
}

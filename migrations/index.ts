import * as migration_20261022_163428_inicial from './20261022_163428_inicial';
import * as migration_20261030_161656_escuela_grupos from './20261030_161656_escuela_grupos';
import * as migration_20261103_201313_antispam_4c from './20261103_201313_antispam_4c';
import * as migration_20261103_215923_imagenes_5b from './20261103_215923_imagenes_5b';

export const migrations = [
  {
    up: migration_20261022_163428_inicial.up,
    down: migration_20261022_163428_inicial.down,
    name: '20261022_163428_inicial',
  },
  {
    up: migration_20261030_161656_escuela_grupos.up,
    down: migration_20261030_161656_escuela_grupos.down,
    name: '20261030_161656_escuela_grupos',
  },
  {
    up: migration_20261103_201313_antispam_4c.up,
    down: migration_20261103_201313_antispam_4c.down,
    name: '20261103_201313_antispam_4c',
  },
  {
    up: migration_20261103_215923_imagenes_5b.up,
    down: migration_20261103_215923_imagenes_5b.down,
    name: '20261103_215923_imagenes_5b'
  },
];

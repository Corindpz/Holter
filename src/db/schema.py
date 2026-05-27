import sqlite3


DDL = """
CREATE TABLE IF NOT EXISTS semaines (
    code TEXT PRIMARY KEY,
    date_debut TEXT NOT NULL,
    date_fin TEXT NOT NULL,
    expert_nom TEXT,
    date_import TEXT NOT NULL,
    nb_tickets INTEGER DEFAULT 0,
    analyse_complete INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tickets (
    id TEXT NOT NULL,
    semaine_code TEXT NOT NULL REFERENCES semaines(code),
    objet TEXT,
    priorite TEXT,
    statut TEXT,
    produit TEXT,
    site TEXT,
    description TEXT,
    description_anonyme TEXT,
    date_creation TEXT,
    PRIMARY KEY (id, semaine_code)
);

CREATE TABLE IF NOT EXISTS analyses (
    ticket_id TEXT NOT NULL,
    semaine_code TEXT NOT NULL,
    decision TEXT NOT NULL,
    signal TEXT,
    niveau TEXT,
    confiance REAL,
    raisonnement TEXT,
    articles_cites TEXT,
    capa_suggere INTEGER DEFAULT 0,
    capa_justification TEXT,
    mots_cles TEXT,
    passe_finale INTEGER DEFAULT 1,
    PRIMARY KEY (ticket_id, semaine_code),
    FOREIGN KEY (ticket_id, semaine_code) REFERENCES tickets(id, semaine_code)
);

CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    semaine_code TEXT NOT NULL,
    expert_nom TEXT NOT NULL,
    action_expert TEXT NOT NULL,
    decision_finale TEXT NOT NULL,
    commentaire TEXT,
    horodatage TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exclusions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    champ TEXT NOT NULL,
    operateur TEXT NOT NULL,
    valeur TEXT NOT NULL,
    raison TEXT NOT NULL,
    actif INTEGER DEFAULT 1,
    cree_par TEXT NOT NULL,
    date_creation TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dictionnaire (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL UNIQUE,
    signal TEXT NOT NULL,
    niveau TEXT NOT NULL,
    article TEXT,
    cree_par TEXT NOT NULL,
    date_creation TEXT NOT NULL,
    semaines_validees INTEGER DEFAULT 0,
    poids TEXT DEFAULT 'faible'
);
"""


def init_db(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    conn.executescript(DDL)
    # Migrate existing databases that lack capa_justification
    try:
        conn.execute("ALTER TABLE analyses ADD COLUMN capa_justification TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    conn.commit()
    conn.close()

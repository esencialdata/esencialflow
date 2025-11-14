import React, { useMemo, useState } from 'react';
import { useLists } from '../hooks/useLists';
import { useCards } from '../hooks/useCards';
import './HomeDashboard.css';
import LoadingOverlay from './LoadingOverlay';

interface HomeDashboardProps {
  boardId: string | null;
  onOpenList?: (listId: string) => void;
}

const dailyQuotes: { text: string; author: string }[] = [
  { text: 'La felicidad de tu vida depende de la calidad de tus pensamientos.', author: 'Marco Aurelio' },
  { text: 'No son las cosas las que nos perturban, sino nuestra opinión sobre ellas.', author: 'Epicteto' },
  { text: 'No es que tengamos poco tiempo, es que perdemos mucho.', author: 'Séneca' },
  { text: 'Mientras vivimos, aprendamos a vivir.', author: 'Séneca' },
  { text: 'La vida no examinada no merece ser vivida.', author: 'Sócrates' },
  { text: 'Somos lo que hacemos día a día. La excelencia es un hábito.', author: 'Aristóteles' },
  { text: 'Un viaje de mil millas comienza con un solo paso.', author: 'Lao-Tse' },
  { text: 'Somos lo que pensamos. Todo lo que somos surge con nuestros pensamientos.', author: 'Buda' },
  { text: 'No importa lo lento que vayas mientras no te detengas.', author: 'Confucio' },
  { text: 'Primero dite a ti mismo quién quieres ser; luego haz lo que debes hacer.', author: 'Epicteto' },
  { text: 'Cuando te levantes por la mañana, piensa en el privilegio de estar vivo.', author: 'Marco Aurelio' },
  { text: 'Quien tiene un porqué para vivir puede soportar casi cualquier cómo.', author: 'Friedrich Nietzsche' },
  { text: 'Al hombre se le puede arrebatar todo salvo la libertad de elegir su actitud.', author: 'Viktor Frankl' },
  { text: 'La imaginación es más importante que el conocimiento.', author: 'Albert Einstein' },
  { text: 'Nada en la vida debe ser temido, sólo comprendido.', author: 'Marie Curie' },
  { text: 'Actúa como si lo que haces marcara la diferencia. Lo hace.', author: 'William James' },
  { text: 'El éxito es la suma de pequeños esfuerzos repetidos día tras día.', author: 'Robert Collier' },
  { text: 'La disciplina es el puente entre metas y logros.', author: 'Jim Rohn' },
  { text: 'No cuentes los días; haz que los días cuenten.', author: 'Muhammad Ali' },
  { text: 'Sé el cambio que quieres ver en el mundo.', author: 'Mahatma Gandhi' },
  { text: 'Siempre parece imposible hasta que se hace.', author: 'Nelson Mandela' },
  { text: 'Da el primer paso con fe, no necesitas ver toda la escalera.', author: 'Martin Luther King Jr.' },
  { text: 'La actitud es una pequeña cosa que marca una gran diferencia.', author: 'Winston Churchill' },
  { text: 'El éxito consiste en ir de fracaso en fracaso sin perder el entusiasmo.', author: 'Winston Churchill' },
  { text: 'Tu tiempo es limitado, así que no lo desperdicies viviendo la vida de otro.', author: 'Steve Jobs' },
  { text: 'Alguien se sienta hoy en la sombra porque alguien plantó un árbol hace mucho tiempo.', author: 'Warren Buffett' },
  { text: 'La mayoría de la gente sobreestima lo que puede hacer en un año y subestima lo que puede hacer en diez.', author: 'Bill Gates' },
  { text: 'La mejor manera de predecir el futuro es crearlo.', author: 'Peter Drucker' },
  { text: 'Si duplicas el número de experimentos al año, duplicarás tu capacidad de innovación.', author: 'Jeff Bezos' },
  { text: 'La persistencia es muy importante. No debes rendirte a menos que te veas obligado a rendirte.', author: 'Elon Musk' },
  { text: 'En la vida obtienes lo que tienes el coraje de pedir.', author: 'Oprah Winfrey' },
  { text: 'Si quieres ir rápido, ve solo; si quieres llegar lejos, ve acompañado.', author: 'Proverbio africano' },
  { text: 'Tu cerebro cambia con aquello en lo que te enfocas repetidamente.', author: 'Neurociencia moderna' },
  { text: 'Dormir bien es una de las formas más poderosas de cuidar tu mente.', author: 'Neurociencia del sueño' },
  { text: 'El estrés no es sólo lo que te pasa, sino cómo tu cuerpo interpreta lo que te pasa.', author: 'Psicología del estrés' },
  { text: 'Cada vez que eliges un pequeño hábito sano, estás cableando un nuevo futuro en tu cerebro.', author: 'Neuroplasticidad' },
  { text: 'Nombrar tus emociones es el primer paso para regularlas.', author: 'Psicología emocional' },
  { text: 'La gratitud diaria entrena a tu cerebro para ver oportunidades en lugar de amenazas.', author: 'Psicología positiva' },
  { text: 'Lo que no se agenda, rara vez ocurre.', author: 'Productividad' },
  { text: 'La distracción constante tiene un coste: fragmenta tu atención y tu energía.', author: 'Ciencia de la atención' },
  { text: 'Todo hombre puede ser, si se lo propone, escultor de su propio cerebro.', author: 'Santiago Ramón y Cajal' },
  { text: 'No eres tus pensamientos; eres el espacio que los observa.', author: 'Mindfulness' },
  { text: 'Haz hoy algo de lo que tu "yo" de mañana pueda sentirse orgulloso.', author: 'Anónimo' },
  { text: 'Empieza por lo más difícil: el resto del día se sentirá ligero.', author: 'Anónimo' },
  { text: 'Si esperas a tener ganas para actuar, llegarás tarde a tu propia vida.', author: 'Anónimo' },
  { text: 'Un pequeño avance diario, multiplicado por años, se vuelve imparable.', author: 'Anónimo' },
  { text: 'Pregúntate cada mañana: ¿qué depende de mí hoy?, y empieza por ahí.', author: 'Anónimo' },
  { text: 'El objetivo no es ser perfecto, sino ser cada día un poco más consciente.', author: 'Anónimo' },
  { text: 'La claridad no aparece sola: se crea escribiendo, pensando y conversando.', author: 'Anónimo' },
  { text: 'Tus primeros minutos del día establecen el tono de tus decisiones.', author: 'Anónimo' }
];

const selectQuoteForToday = (): { text: string; author: string } => {
  const pool = dailyQuotes.length ? dailyQuotes : [{ text: 'Enfócate en un avance a la vez.', author: 'Esencial Flow' }];
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const index = ((dayOfYear % pool.length) + pool.length) % pool.length;
  return pool[index];
};

const HomeDashboard: React.FC<HomeDashboardProps> = ({ boardId, onOpenList }) => {
  const { lists, isLoading: listsLoading, error: listsError, handleCreateList } = useLists(boardId);
  const { cards, isLoading: cardsLoading, error: cardsError } = useCards(boardId);
  const [newListName, setNewListName] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const dailyQuote = useMemo(() => selectQuoteForToday(), []);

  const onCreateList = () => {
    if (!newListName.trim()) return;
    handleCreateList(newListName.trim());
    setNewListName('');
  };

  if (!boardId) {
    return (
      <div className="home-empty">
        <h2>Select or create a board to get started</h2>
      </div>
    );
  }

  if (listsLoading || cardsLoading) return <LoadingOverlay message="Cargando tablero…" />;
  if (listsError || cardsError) return <p className="error-message">{listsError || cardsError}</p>;

  // Reports data
  const allCards = Object.values(cards).flat();
  const totalLists = lists.length;
  const totalCards = allCards.length;
  const cardsWithDueDate = allCards.filter(c => !!c.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const toLocalDateOnly = (d: any) => {
    const dt = new Date(d);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
  };
  const cardsDueToday = cardsWithDueDate.filter(c => {
    const d = toLocalDateOnly(c.dueDate as any);
    return d >= today && d < tomorrow;
  });
  const cardsWithoutDue = totalCards - cardsWithDueDate.length;

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <h1>&ldquo;{dailyQuote.text}&rdquo;</h1>
          <p className="subtitle">— {dailyQuote.author}</p>
        </div>
        <div className="home-actions">
          {/* Placeholder for actions like upgrade/settings if needed */}
        </div>
      </header>

      <section className="home-reports">
        <div className="report-tile">
          <div className="report-value">{totalLists}</div>
          <div className="report-label">Listas</div>
        </div>
        <div className="report-tile">
          <div className="report-value">{totalCards}</div>
          <div className="report-label">Tarjetas</div>
        </div>
        <div className="report-tile">
          <div className="report-value">{cardsDueToday.length}</div>
          <div className="report-label">Vencen hoy</div>
        </div>
        <div className="report-tile">
          <div className="report-value">{cardsWithoutDue}</div>
          <div className="report-label">Sin fecha</div>
        </div>
      </section>

      <section className="lists-grid">
        {lists.map((list) => {
          const listCards = cards[list.listId] || [];
          return (
            <div
              key={list.listId}
              className="list-tile"
              onClick={() => onOpenList && onOpenList(list.listId)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpenList && onOpenList(list.listId); }}
            >
              <div className="tile-header">
                <div className="badge" title={list.name}>{list.name?.[0]?.toUpperCase() || 'L'}</div>
                <h3 title={list.name}>{list.name}</h3>
                <button className="icon-btn" aria-label="List actions">•••</button>
              </div>
              <div className="tile-body">
                {(expanded[list.listId] ? listCards : listCards.slice(0, 4)).map((c, idx) => (
                  <div key={c.id} className="chip" title={c.title}>
                    <span className="chip-index">{idx + 1}</span>
                    <span className="chip-title">{c.title}</span>
                    <span className="chip-time">00:00</span>
                  </div>
                ))}
                {listCards.length > 4 && (
                  <button
                    className="link-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(prev => ({ ...prev, [list.listId]: !prev[list.listId] }));
                    }}
                  >
                    {expanded[list.listId] ? 'Ver menos' : `Ver todas (${listCards.length})`}
                  </button>
                )}
              </div>
              <div className="tile-footer">{listCards.length} cards</div>
            </div>
          );
        })}

        <div className="list-tile create">
          <div className="create-inner">
            <div className="plus">+</div>
            <input
              type="text"
              placeholder="Create list"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCreateList()}
            />
            <button onClick={onCreateList}>Create</button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomeDashboard;

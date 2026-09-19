import { useMemo, type ReactNode } from 'react';
import { describeContext, describeReadings, revealMetrics } from '../graph/metrics';
import { cardinal, ordinal, ordinalMark } from '../graph/project';
import { describeAsymmetry, readCharacter, type RoundReading } from '../graph/reading';
import { CampSplit, CrowdStrip, LookAlikeRings, TieWeights } from '../render/ReadingFigures';
import { NameLink } from '../render/NameLink';
import { DegreeBars } from '../gallery/Fingerprint';
import type { WorldMetrics } from '../gallery/metrics';
import type { NodeFacts, NodeIndex, Universe, UniverseMeta } from '../types';

/**
 * One character, read.
 *
 * Organised by the question each part answers, because the page is read by
 * somebody who has just been told who they were and now wants to know what
 * that meant. The earlier version of this page was organised by where the
 * number came from — the session's figures together, the graph's figures
 * together — which is the order the code computes them in and no order at all
 * to read them in.
 *
 * The voice is second person throughout, and stays that way in the gallery,
 * where the subject is somebody the reader never played. That is deliberate:
 * the gallery frames it as the reveal you would have been given had you woken
 * here, which is a truer description of what these figures are than any
 * third-person rewrite of the same sentences.
 */

export function Group({ question, children }: { question: string; children: ReactNode }) {
  return (
    <section style={{ borderTop: '1px solid var(--rule)', paddingTop: 16, marginTop: 30 }}>
      <h2
        className="mono"
        style={{
          fontSize: 9.5,
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          color: 'var(--annotation)',
          margin: 0,
          paddingBottom: 14,
          fontWeight: 400,
        }}
      >
        {question}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  );
}

function Prose({ lines }: { lines: ReactNode[] }) {
  if (lines.length === 0) return null;
  return (
    <div style={{ fontSize: 16, color: 'var(--annotation)', lineHeight: 1.75 }}>
      {lines.map((line, k) => (
        <div key={k}>{line}</div>
      ))}
    </div>
  );
}

/**
 * What the rings are, and what one more move would have done.
 *
 * The second half is the part worth printing: of every tie the player left face
 * down, which one would have thrown out the most rivals. It is the only line on
 * this page describing something they could have done differently, and unlike
 * the count it is specific enough to argue with.
 */
function ringsCaption(
  shown: number,
  round: RoundReading | null,
  linkToCharacter?: (i: number) => void,
): ReactNode {
  // Says how many are drawn, because the sentence above gives how many there
  // were and the two are rarely the same number: sixty-one look-alikes, three
  // of them on the paper.
  const what = `Your opening ring, and the ${shown === 1 ? 'one whose ring came' : `${cardinal(shown)} whose rings came`} closest to it. Each has the same number of ties as yours, which is all the first frame ever says: only the weight of each tie and the standing of the person on the end of it tell them apart.`;
  if (!round) return what;

  const { discriminator, candidates } = round;
  if (candidates.standing <= 1) {
    return `${what} What you turned over ruled out the rest: by the end, the paper had named you.`;
  }
  if (!discriminator || discriminator.rulesOut === 0) {
    return `${what} Nothing left in your own ring would have separated you from them. The diagram alone was never going to name you.`;
  }
  const name = linkToCharacter ? (
    <NameLink onClick={() => linkToCharacter(discriminator.i)}>{discriminator.name}</NameLink>
  ) : (
    discriminator.name
  );
  return (
    <>
      {what} Turning over {name}{' '}
      {discriminator.leavesOnlyYou ? 'would have left only you.' : `would have ruled out ${cardinal(discriminator.rulesOut)} of them.`}
    </>
  );
}

/** How many ties the list beside the drawing holds.
 *
 * Ten, because ten is what the column has room for. An earlier pass cut it to
 * eight to make the two halves end on exactly the same line, which is a rule
 * about the drawing's height rather than about the reading: eight names is
 * less of this character's world than the space could have shown, and nobody
 * reading it would have thanked the page for the tidy edge. The drawing is
 * taller instead, and the two halves come close enough. */
const TIE_ROWS = 10;

/** "A", "A and B", "A, B and C" — the list is at most three names long, so
 * there is no case here worth a library. Takes nodes rather than strings so a
 * name can be a link without this losing its punctuation logic. */
function joinNames(names: ReactNode[]): ReactNode {
  if (names.length <= 1) return names[0] ?? '';
  return (
    <>
      {names.slice(0, -1).map((name, k) => (
        <span key={k}>
          {name}
          {', '}
        </span>
      ))}
      and {names[names.length - 1]}
    </>
  );
}

/**
 * A figure and the note that says what it is, side by side.
 *
 * The note is set in the reading voice, not the annotation one. `annot` is
 * uppercase tracked mono, which is right for a two-word axis label and wrong
 * for three sentences: at nine pixels, uppercase and letter-spaced, a caption
 * that long stops being read and starts being skipped, which leaves the figure
 * above it a grey smudge nobody can interpret. Short labels on the figures
 * themselves stay in mono; anything with a verb in it is prose.
 */
function Note({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: 'var(--serif)',
        fontSize: 13.5,
        lineHeight: 1.6,
        color: 'var(--annotation)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Plate({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="reading-plate" style={{ paddingTop: 2 }}>
      <div>{children}</div>
      <Note>{caption}</Note>
    </div>
  );
}

export function CharacterReading({
  universe,
  world,
  meta,
  i,
  round = null,
  linkToCharacter,
  linkToTwin,
}: {
  universe: Universe;
  world: WorldMetrics;
  meta: UniverseMeta | null;
  i: NodeIndex;
  /** Absent in the gallery, where there is no round behind the character. */
  round?: RoundReading | null;
  /** Jump to another character's own reading, in the topology gallery. Every
   * name below is someone the story already names by the time this page can
   * be read, so nothing here is a spoiler that a link would hand out early. */
  linkToCharacter?: (i: NodeIndex) => void;
  /** The one name on this page that can belong to a different world: the
   * nearest double, found across the whole catalogue. */
  linkToTwin?: (world: string, name: string) => void;
}) {
  const reading = useMemo(() => readCharacter(universe, world, i), [universe, world, i]);
  const metrics = useMemo(() => revealMetrics(universe, i), [universe, i]);
  const record = meta?.nodes[String(i)] ?? null;
  const facts = useMemo(() => (record?.facts ?? {}) as NodeFacts, [record]);
  const context = useMemo(() => describeContext(meta, facts), [meta, facts]);
  const readings = useMemo(
    () => describeReadings(metrics, record?.signals ?? null, universe.id, 4, linkToCharacter, linkToTwin),
    [metrics, record, universe.id, linkToCharacter, linkToTwin],
  );
  const asymmetry = describeAsymmetry(reading);

  const { shortlist, standing } = reading;
  const mine = reading.ease.mine;
  // Standing is a rank, and the crowd strip wants it on the same 0-to-1 axis
  // the rest of the cast is drawn on.
  const myStanding = world.characters.find((c) => c.i === i)?.prominence ?? null;

  return (
    <>
      {(record?.line || context.length > 0) && (
        <Group question="Who you were">
          {record?.line && (
            <div style={{ fontSize: 'clamp(16px, 4.2vw, 19px)', color: 'var(--body)', lineHeight: 1.55 }}>
              {record.line}
            </div>
          )}
          <Prose lines={context} />
        </Group>
      )}

      {readings.length > 0 && (
        <Group question="What the shape said">
          <Prose lines={readings} />
        </Group>
      )}

      {reading.ties.length > 0 && (
        <Group question="Were you anyone to them?">
          {asymmetry && (
            <div style={{ fontSize: 17, color: 'var(--body)', lineHeight: 1.6 }}>{asymmetry}</div>
          )}
          {/* The drawing keeps its half and takes its note underneath rather
              than beside it, because the other half is doing something better:
              naming the people the drawing is only bars of, and saying what
              each of them made of you. The two columns are the same question
              asked twice, once as a shape and once as a list. */}
          <div className="reading-plate" style={{ paddingTop: 2 }}>
            <div>
              <TieWeights weights={reading.weights} />
              <Note style={{ paddingTop: 8 }}>
                Your ties, heaviest first: how much of this world you shared with each.
              </Note>
            </div>

            {reading.ties.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div
                  className="mono"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 7.5,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: 'var(--unknown)',
                    borderBottom: '1px solid var(--rule)',
                    paddingBottom: 5,
                    marginBottom: 2,
                  }}
                >
                  <span>Yours, in order</span>
                  <span>You, to them</span>
                </div>
                {reading.ties.slice(0, TIE_ROWS).map((tie, k) => (
                  <div
                    key={tie.i}
                    style={{ display: 'flex', alignItems: 'baseline', gap: 8, lineHeight: 1.3 }}
                  >
                    {/* The row's own position is the rank on your side, so it
                        is printed once, as a numeral, instead of "your 4th" on
                        every line of a list that is already in that order. */}
                    <span
                      className="mono"
                      style={{ fontSize: 9, color: 'var(--unknown)', width: 13, flexShrink: 0 }}
                    >
                      {k + 1}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--serif)',
                        fontSize: 14,
                        color: 'var(--ink)',
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {linkToCharacter ? (
                        <NameLink style={{ display: 'inline' }} onClick={() => linkToCharacter(tie.i)}>
                          {tie.name}
                        </NameLink>
                      ) : (
                        tie.name
                      )}
                    </span>
                    <span
                      className="mono"
                      style={{ fontSize: 9.5, color: 'var(--annotation)', flexShrink: 0 }}
                      title={`You were ${ordinal(tie.theirPlace)} of ${tie.theirDegree} to ${tie.name}`}
                    >
                      {ordinalMark(tie.theirPlace)} of {tie.theirDegree}
                    </span>
                  </div>
                ))}
                {reading.ties.length > TIE_ROWS && (
                  <Note style={{ fontSize: 12, paddingTop: 4 }}>
                    and {reading.ties.length - TIE_ROWS} more.
                  </Note>
                )}
              </div>
            )}
          </div>
        </Group>
      )}

      <Group question="Could you have known?">
        <div style={{ fontSize: 16, color: 'var(--annotation)', lineHeight: 1.75 }}>
          {shortlist.count === 0
            ? 'Nobody else in this world opened with the number of ties you had. The first frame named you, if anyone could have read it.'
            : `${shortlist.count === 1 ? 'One other person' : `${shortlist.count} other people`} in this world opened with exactly as many ties as you.`}
        </div>

        {/* Drawn whenever there was more than one person it could have been.
            Full width rather than in a plate: four rings side by side need the
            column, and the note belongs under them where it can be read
            against all four at once. */}
        {shortlist.nearest.length > 0 && (
          <div style={{ paddingTop: 4 }}>
            <LookAlikeRings
              rings={[
                { name: reading.name, ring: reading.ring, you: true },
                ...shortlist.nearest.map((other) => ({ i: other.i, name: other.name, ring: other.ring })),
              ]}
              onSelect={linkToCharacter}
            />
            <Note style={{ paddingTop: 10 }}>
              {ringsCaption(shortlist.nearest.length, round, linkToCharacter)}
            </Note>
          </div>
        )}
      </Group>

      {reading.ties.length > 0 && (
        <Group question="Who did you stand among?">
          <Plate caption="One mark for each person you knew, placed by how much of this world they are in. The red mark is you.">
            <CrowdStrip
              values={reading.company}
              mark={myStanding}
              left="Barely there"
              right="The whole world"
            />
          </Plate>
          <Plate caption="The people you knew, grouped by how many ties they had themselves. The label underneath a bar is that group's tie count; the number on top is how many of your ties fall in it. Weight to the right means you stood among the well connected.">
            {/* Drawn in a wider coordinate space than the cell it lands in, because
                this one caps itself at its own `width` and would otherwise stop
                short of the plate the other figures fill. The scale-down takes
                the labels to about seven pixels, which is what the gallery's
                cards use. */}
            <DegreeBars histogram={reading.neighbourDegrees} width={340} height={74} labelSize={10} />
          </Plate>
        </Group>
      )}

      {reading.ties.length > 0 && (
        <Group question="Where did you stand?">
          <div style={{ fontSize: 17, color: 'var(--body)', lineHeight: 1.6 }}>
            <span className="mono" style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--annotation)' }}>
              {standing.label}
            </span>
            <div style={{ paddingTop: 8 }}>{standing.line}</div>
          </div>
          <Plate caption="Your ties, split by whether they stayed in your own camp.">
            <CampSplit inCamp={standing.inCamp} outCamp={standing.outCamp} camps={standing.camps} />
          </Plate>
        </Group>
      )}

      {mine != null && reading.ease.all.length > 1 && (
        <Group question="Was this a hard place to wake?">
          <Plate caption="Every start this world offers, by how findable it is. The red mark is the one you drew.">
            <CrowdStrip crowd={reading.ease.all} mark={mine} left="Obscure" right="Findable" />
          </Plate>
        </Group>
      )}

      {round && (round.missed || round.neverTurned.length > 0) && (
        <Group question="What you left on the table">
          {round.neverTurned.length > 0 && (
            <div style={{ fontSize: 16, color: 'var(--annotation)', lineHeight: 1.75 }}>
              {(() => {
                const nameNode = (t: (typeof round.neverTurned)[number]) =>
                  linkToCharacter ? (
                    <NameLink key={t.i} onClick={() => linkToCharacter(t.i)}>
                      {t.name}
                    </NameLink>
                  ) : (
                    t.name
                  );
                return round.neverTurned.length === 1 ? (
                  <>
                    You never once turned over {nameNode(round.neverTurned[0])}, and you shared more of
                    this world with them than with almost anyone.
                  </>
                ) : (
                  <>
                    You never turned over {joinNames(round.neverTurned.map(nameNode))}:{' '}
                    {cardinal(round.neverTurned.length)} of the people you shared most of this world with.
                  </>
                );
              })()}
            </div>
          )}
          {round.missed && (
            <div style={{ fontSize: 16, color: 'var(--annotation)', lineHeight: 1.75 }}>
              One more expansion, through{' '}
              {linkToCharacter ? (
                <NameLink onClick={() => linkToCharacter(round.missed!.throughId)}>
                  {round.missed.through}
                </NameLink>
              ) : (
                round.missed.through
              )}
              , and you would have been looking at{' '}
              {linkToCharacter ? (
                <NameLink onClick={() => linkToCharacter(round.missed!.whoId)}>{round.missed.who}</NameLink>
              ) : (
                round.missed.who
              )}
              .
            </div>
          )}
        </Group>
      )}
    </>
  );
}

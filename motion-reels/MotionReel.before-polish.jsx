import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const C = {
  bg: '#FAF6F0',
  text: '#241E19',
  muted: '#806F65',
  accent: '#B95030',
  accent2: '#E7906E',
  line: '#E6D9D0',
  white: '#FFFDFC',
  soft: '#F1E3D9',
  green: '#647A62',
};

const money = (n) =>
  Math.round(n).toLocaleString('ru-RU') + ' ₽';

const getScene = (data, index) => {
  return data.scenes?.[index] || {};
};

const Header = ({light = false}) => (
  <>
    <div
      style={{
        position: 'absolute',
        top: 72,
        left: 78,
        fontSize: 27,
        letterSpacing: 3,
        fontWeight: 800,
        color: light ? C.white : C.accent,
      }}
    >
      СЕМЕЙНЫЙ ПОТОК
    </div>

    <div
      style={{
        position: 'absolute',
        top: 118,
        left: 78,
        right: 78,
        height: 2,
        background: light
          ? 'rgba(255,255,255,.25)'
          : C.line,
      }}
    />
  </>
);

const Subtitle = ({children, light = false}) => (
  <div
    style={{
      position: 'absolute',
      left: 76,
      right: 76,
      bottom: 95,
      padding: '24px 28px',
      borderRadius: 22,
      background: light
        ? 'rgba(36,30,25,.68)'
        : 'rgba(255,253,252,.94)',
      fontSize: 31,
      lineHeight: 1.25,
      color: light ? C.white : C.text,
      boxShadow: '0 12px 40px rgba(40,30,20,.08)',
    }}
  >
    {children}
  </div>
);

const BigTitle = ({children, light = false}) => (
  <div
    style={{
      fontSize: 76,
      lineHeight: 1.04,
      fontWeight: 800,
      letterSpacing: -2,
      color: light ? C.white : C.text,
    }}
  >
    {children}
  </div>
);

const Pill = ({
  children,
  x = 0,
  y = 0,
  opacity = 1,
  scale = 1,
  accent = false,
}) => (
  <div
    style={{
      transform: `translate(${x}px, ${y}px) scale(${scale})`,
      opacity,
      padding: '22px 28px',
      borderRadius: 24,
      background: accent ? C.accent : C.white,
      color: accent ? C.white : C.text,
      fontSize: 30,
      fontWeight: 700,
      boxShadow: '0 15px 42px rgba(50,35,25,.12)',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </div>
);

const Scene1 = ({data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scene = getScene(data, 0);

  const enter = spring({
    frame,
    fps,
    config: {damping: 15},
  });

  const balance = interpolate(
    frame,
    [20, 80],
    [120000, 47000],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  const expenseOpacity = (start) =>
    interpolate(
      frame,
      [start, start + 10],
      [0, 1],
      {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }
    );

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Header />

      <div
        style={{
          position: 'absolute',
          left: 78,
          right: 78,
          top: 245,
        }}
      >
        <BigTitle>
          {scene.overlay || 'Зарплата пришла'}
        </BigTitle>

        <div
          style={{
            marginTop: 80,
            fontSize: 34,
            color: C.muted,
          }}
        >
          доступно сейчас
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: 112,
            fontWeight: 800,
            letterSpacing: -5,
            color: C.text,
            transform: `scale(${0.92 + enter * 0.08})`,
            transformOrigin: 'left center',
          }}
        >
          {money(balance)}
        </div>

        <div
          style={{
            position: 'relative',
            height: 460,
            marginTop: 70,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              opacity: expenseOpacity(30),
            }}
          >
            <Pill>−45 000 ₽ · жильё</Pill>
          </div>

          <div
            style={{
              position: 'absolute',
              left: 110,
              top: 112,
              opacity: expenseOpacity(45),
            }}
          >
            <Pill>−20 000 ₽ · продукты</Pill>
          </div>

          <div
            style={{
              position: 'absolute',
              left: 25,
              top: 224,
              opacity: expenseOpacity(60),
            }}
          >
            <Pill>−8 000 ₽ · сад</Pill>
          </div>
        </div>
      </div>

      <Subtitle>
        {scene.voice ||
          'Баланс после зарплаты выглядит большим. Но часть денег уже занята будущими платежами.'}
      </Subtitle>
    </AbsoluteFill>
  );
};

const Phone = ({frame}) => {
  const float = Math.sin(frame / 15) * 8;

  return (
    <div
      style={{
        width: 430,
        height: 790,
        borderRadius: 58,
        padding: 22,
        background: '#25201D',
        boxShadow: '0 35px 90px rgba(40,28,20,.24)',
        transform: `translateY(${float}px)`,
      }}
    >
      <div
        style={{
          height: '100%',
          borderRadius: 42,
          background: C.bg,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            padding: '48px 34px 0',
            fontSize: 24,
            color: C.muted,
            fontWeight: 700,
          }}
        >
          СВОБОДНО ДО ДОХОДА
        </div>

        <div
          style={{
            padding: '12px 34px',
            fontSize: 62,
            fontWeight: 800,
            color: C.text,
          }}
        >
          31 400 ₽
        </div>

        <div
          style={{
            margin: '42px 28px 0',
            padding: 28,
            borderRadius: 28,
            background: C.white,
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: C.muted,
            }}
          >
            Ближайший платёж
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              marginTop: 8,
            }}
          >
            Коммунальные
          </div>
          <div
            style={{
              marginTop: 26,
              height: 14,
              borderRadius: 12,
              background: C.soft,
            }}
          >
            <div
              style={{
                width: '68%',
                height: '100%',
                borderRadius: 12,
                background: C.accent,
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 14,
            margin: '24px 28px',
          }}
        >
          {['Жильё', 'Еда', 'Цели'].map((x) => (
            <div
              key={x}
              style={{
                flex: 1,
                padding: '22px 8px',
                background: C.white,
                borderRadius: 20,
                textAlign: 'center',
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {x}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Scene2 = ({data}) => {
  const frame = useCurrentFrame();
  const scene = getScene(data, 1);

  const move = interpolate(
    frame,
    [0, 45],
    [110, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Header />

      <div
        style={{
          position: 'absolute',
          left: 78,
          right: 78,
          top: 235,
        }}
      >
        <BigTitle>
          {scene.overlay ||
            'Баланс — не свободные деньги'}
        </BigTitle>

        <div
          style={{
            marginTop: 80,
            display: 'flex',
            justifyContent: 'center',
            transform: `translateY(${move}px)`,
          }}
        >
          <Phone frame={frame} />
        </div>
      </div>

      <Subtitle>
        {scene.voice ||
          'Баланс кажется свободным, хотя внутри уже живут будущие платежи.'}
      </Subtitle>
    </AbsoluteFill>
  );
};

const Scene3 = ({data}) => {
  const frame = useCurrentFrame();
  const scene = getScene(data, 2);

  const items = [
    ['Жильё', '45 000 ₽'],
    ['Счета', '9 500 ₽'],
    ['Сад', '8 000 ₽'],
  ];

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Header />

      <div
        style={{
          position: 'absolute',
          left: 78,
          right: 78,
          top: 235,
        }}
      >
        <BigTitle>
          {scene.overlay ||
            'Сначала обязательное'}
        </BigTitle>

        <div
          style={{
            marginTop: 100,
            display: 'grid',
            gap: 24,
          }}
        >
          {items.map((item, index) => {
            const p = spring({
              frame: frame - index * 10,
              fps: 30,
              config: {damping: 15},
            });

            return (
              <div
                key={item[0]}
                style={{
                  padding: '34px 38px',
                  borderRadius: 30,
                  background: C.white,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow:
                    '0 14px 38px rgba(45,30,20,.08)',
                  opacity: p,
                  transform: `translateX(${
                    (1 - p) * 120
                  }px)`,
                }}
              >
                <div
                  style={{
                    fontSize: 34,
                    fontWeight: 750,
                  }}
                >
                  {item[0]}
                </div>
                <div
                  style={{
                    fontSize: 34,
                    fontWeight: 800,
                    color: C.accent,
                  }}
                >
                  {item[1]}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 65,
            padding: '34px 38px',
            borderRadius: 30,
            background: C.accent,
            color: C.white,
            fontSize: 34,
            fontWeight: 750,
          }}
        >
          Эти деньги больше не считаем свободными
        </div>
      </div>

      <Subtitle>
        {scene.voice ||
          'Сначала отделите жильё, счета и всё, у чего есть дата.'}
      </Subtitle>
    </AbsoluteFill>
  );
};

const Scene4 = ({data}) => {
  const frame = useCurrentFrame();
  const scene = getScene(data, 3);

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Header />

      <div
        style={{
          position: 'absolute',
          left: 78,
          right: 78,
          top: 235,
        }}
      >
        <BigTitle>
          {scene.overlay ||
            'Потом — обычная жизнь'}
        </BigTitle>

        <div
          style={{
            marginTop: 120,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 26,
          }}
        >
          {[1, 2, 3, 4].map((week, i) => {
            const p = spring({
              frame: frame - i * 9,
              fps: 30,
              config: {damping: 14},
            });

            return (
              <div
                key={week}
                style={{
                  height: 260,
                  borderRadius: 34,
                  background:
                    i === 0 ? C.accent : C.white,
                  color:
                    i === 0 ? C.white : C.text,
                  padding: 32,
                  opacity: p,
                  transform: `scale(${
                    0.88 + p * 0.12
                  })`,
                }}
              >
                <div
                  style={{
                    fontSize: 25,
                    opacity: 0.75,
                  }}
                >
                  НЕДЕЛЯ {week}
                </div>

                <div
                  style={{
                    marginTop: 45,
                    fontSize: 54,
                    fontWeight: 850,
                  }}
                >
                  8 500 ₽
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Subtitle>
        {scene.voice ||
          'Продукты, дорогу и мелочи удобнее планировать по неделям.'}
      </Subtitle>
    </AbsoluteFill>
  );
};

const Scene5 = ({data}) => {
  const frame = useCurrentFrame();
  const scene = getScene(data, 4);

  const blocks = [
    {
      name: 'Цель',
      value: '10 000 ₽',
      bg: C.green,
    },
    {
      name: 'Запас',
      value: '5 000 ₽',
      bg: '#A8765B',
    },
    {
      name: 'Можно тратить',
      value: '16 400 ₽',
      bg: C.accent,
    },
  ];

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Header />

      <div
        style={{
          position: 'absolute',
          left: 78,
          right: 78,
          top: 235,
        }}
      >
        <BigTitle>
          {scene.overlay ||
            'Цель + запас + свободные деньги'}
        </BigTitle>

        <div
          style={{
            marginTop: 100,
            display: 'grid',
            gap: 24,
          }}
        >
          {blocks.map((b, i) => {
            const p = spring({
              frame: frame - i * 12,
              fps: 30,
              config: {damping: 13},
            });

            return (
              <div
                key={b.name}
                style={{
                  padding: '38px 38px',
                  borderRadius: 34,
                  background: b.bg,
                  color: C.white,
                  opacity: p,
                  transform: `translateY(${
                    (1 - p) * 70
                  }px)`,
                }}
              >
                <div
                  style={{
                    fontSize: 27,
                    opacity: 0.85,
                  }}
                >
                  {b.name}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    fontSize: 58,
                    fontWeight: 850,
                  }}
                >
                  {b.value}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Subtitle>
        {scene.voice ||
          'Часть — на цель, немного — в запас, и только остаток действительно свободен.'}
      </Subtitle>
    </AbsoluteFill>
  );
};

const Scene6 = ({data}) => {
  const frame = useCurrentFrame();
  const scene = getScene(data, 5);

  const p = spring({
    frame,
    fps: 30,
    config: {damping: 15},
  });

  return (
    <AbsoluteFill
      style={{
        background: C.accent,
        color: C.white,
      }}
    >
      <Header light />

      <div
        style={{
          position: 'absolute',
          left: 78,
          right: 78,
          top: 360,
          transform: `translateY(${
            (1 - p) * 90
          }px)`,
          opacity: p,
        }}
      >
        <div
          style={{
            fontSize: 86,
            lineHeight: 1.04,
            fontWeight: 850,
            letterSpacing: -3,
          }}
        >
          {scene.overlay ||
            'Вот ваш реальный остаток'}
        </div>

        <div
          style={{
            marginTop: 90,
            fontSize: 35,
            lineHeight: 1.35,
            color: '#F8DFD6',
            maxWidth: 820,
          }}
        >
          Спокойнее, когда у денег есть задача
          до покупки.
        </div>

        <div
          style={{
            marginTop: 120,
            display: 'inline-flex',
            padding: '24px 34px',
            borderRadius: 999,
            background: C.white,
            color: C.accent,
            fontSize: 30,
            fontWeight: 800,
          }}
        >
          myfamilyflow.ru
        </div>
      </div>

      <Subtitle light>
        {scene.voice ||
          'Свободны только деньги, у которых пока нет будущей задачи.'}
      </Subtitle>
    </AbsoluteFill>
  );
};

export const MotionReel = ({data}) => {
  const fps = 30;

  const timings = [
    [0, 3],
    [3, 8],
    [8, 14],
    [14, 20],
    [20, 25],
    [25, Number(data.duration_seconds) || 28],
  ];

  const scenes = [
    Scene1,
    Scene2,
    Scene3,
    Scene4,
    Scene5,
    Scene6,
  ];

  return (
    <AbsoluteFill
      style={{
        fontFamily:
          'Arial, Helvetica, sans-serif',
      }}
    >
      {data.voice_static_path ? (
        <Audio
          src={staticFile(
            data.voice_static_path
          )}
          volume={1}
        />
      ) : null}

      {scenes.map((Component, index) => {
        const [start, end] = timings[index];

        return (
          <Sequence
            key={index}
            from={Math.round(start * fps)}
            durationInFrames={Math.round(
              (end - start) * fps
            )}
          >
            <Component data={data} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

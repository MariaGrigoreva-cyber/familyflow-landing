import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
} from 'remotion';

const C = {
  bg: '#FAF6F0',
  text: '#241E19',
  muted: '#806F65',
  accent: '#B95030',
  soft: '#F1E3D9',
  white: '#FFFDFC',
  green: '#687B65',
};

const Header = ({light = false}) => (
  <>
    <div
      style={{
        position: 'absolute',
        top: 74,
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
        top: 122,
        left: 78,
        right: 78,
        height: 2,
        background: light
          ? 'rgba(255,255,255,.25)'
          : '#E5D8CF',
      }}
    />
  </>
);

const Title = ({children, light = false}) => (
  <div
    style={{
      fontSize: 78,
      lineHeight: 1.06,
      fontWeight: 850,
      letterSpacing: -2.5,
      color: light ? C.white : C.text,
    }}
  >
    {children}
  </div>
);

const Card = ({
  children,
  accent = false,
  green = false,
  style = {},
}) => (
  <div
    style={{
      padding: '32px 36px',
      borderRadius: 32,
      background: accent
        ? C.accent
        : green
          ? C.green
          : C.white,
      color:
        accent || green
          ? C.white
          : C.text,
      boxShadow:
        '0 16px 45px rgba(50,35,25,.10)',
      ...style,
    }}
  >
    {children}
  </div>
);

const Scene1 = () => {
  const frame = useCurrentFrame();

  const p = spring({
    frame,
    fps: 30,
    config: {damping: 15},
  });

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Header />

      <div
        style={{
          position: 'absolute',
          top: 320,
          left: 78,
          right: 78,
          opacity: p,
          transform: `translateY(${(1-p)*70}px)`,
        }}
      >
        <Title>
          Семейный бюджет вдвоём —
          {'\n'}не обязательно один кошелёк.
        </Title>

        <div
          style={{
            marginTop: 110,
            display: 'flex',
            gap: 26,
          }}
        >
          <Card style={{flex: 1}}>
            <div
              style={{
                fontSize: 27,
                color: C.muted,
              }}
            >
              МОЙ ДОХОД
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 54,
                fontWeight: 850,
              }}
            >
              90 000 ₽
            </div>
          </Card>

          <Card style={{flex: 1}}>
            <div
              style={{
                fontSize: 27,
                color: C.muted,
              }}
            >
              ТВОЙ ДОХОД
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 54,
                fontWeight: 850,
              }}
            >
              60 000 ₽
            </div>
          </Card>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Scene2 = () => {
  const frame = useCurrentFrame();

  const left = interpolate(
    frame,
    [0, 35],
    [-180, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  const right = interpolate(
    frame,
    [0, 35],
    [180, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  const common = spring({
    frame: Math.max(0, frame - 24),
    fps: 30,
    config: {damping: 14},
  });

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Header />

      <div
        style={{
          position: 'absolute',
          top: 260,
          left: 78,
          right: 78,
        }}
      >
        <Title>
          Сначала договоритесь,
          {'\n'}что у вас общее.
        </Title>

        <div
          style={{
            marginTop: 120,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <Card
            style={{
              transform: `translateX(${left}px)`,
            }}
          >
            90 000 ₽
          </Card>

          <Card
            style={{
              transform: `translateX(${right}px)`,
            }}
          >
            60 000 ₽
          </Card>
        </div>

        <div
          style={{
            marginTop: 75,
            opacity: common,
            transform: `scale(${0.82 + common*0.18})`,
          }}
        >
          <Card accent>
            <div
              style={{
                fontSize: 28,
                opacity: 0.85,
              }}
            >
              ОБЩИЕ ОБЯЗАТЕЛЬСТВА
            </div>

            <div
              style={{
                marginTop: 18,
                fontSize: 60,
                fontWeight: 850,
              }}
            >
              жильё · еда · ребёнок
            </div>
          </Card>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Scene3 = () => {
  const frame = useCurrentFrame();

  const p1 = spring({
    frame,
    fps: 30,
    config: {damping: 14},
  });

  const p2 = spring({
    frame: Math.max(0, frame - 15),
    fps: 30,
    config: {damping: 14},
  });

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Header />

      <div
        style={{
          position: 'absolute',
          top: 270,
          left: 78,
          right: 78,
        }}
      >
        <Title>
          Разделите деньги
          {'\n'}на общее и личное.
        </Title>

        <div
          style={{
            marginTop: 120,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 28,
          }}
        >
          <Card
            accent
            style={{
              height: 430,
              opacity: p1,
              transform: `translateY(${(1-p1)*70}px)`,
            }}
          >
            <div style={{fontSize: 30}}>
              ОБЩЕЕ
            </div>
            <div
              style={{
                marginTop: 60,
                fontSize: 56,
                lineHeight: 1.2,
                fontWeight: 850,
              }}
            >
              жильё
              {'\n'}продукты
              {'\n'}цели
            </div>
          </Card>

          <Card
            green
            style={{
              height: 430,
              opacity: p2,
              transform: `translateY(${(1-p2)*70}px)`,
            }}
          >
            <div style={{fontSize: 30}}>
              ЛИЧНОЕ
            </div>
            <div
              style={{
                marginTop: 60,
                fontSize: 56,
                lineHeight: 1.2,
                fontWeight: 850,
              }}
            >
              кофе
              {'\n'}хобби
              {'\n'}свои покупки
            </div>
          </Card>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Scene4 = () => {
  const frame = useCurrentFrame();

  const widthA = interpolate(
    frame,
    [0, 45],
    [0, 60],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  const widthB = interpolate(
    frame,
    [0, 45],
    [0, 40],
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
          top: 270,
          left: 78,
          right: 78,
        }}
      >
        <Title>
          50/50 — не единственный
          {'\n'}справедливый вариант.
        </Title>

        <div
          style={{
            marginTop: 145,
          }}
        >
          <div
            style={{
              display: 'flex',
              height: 150,
              borderRadius: 34,
              overflow: 'hidden',
              background: C.soft,
            }}
          >
            <div
              style={{
                width: `${widthA}%`,
                background: C.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: C.white,
                fontSize: 46,
                fontWeight: 850,
              }}
            >
              60%
            </div>

            <div
              style={{
                width: `${widthB}%`,
                background: C.green,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: C.white,
                fontSize: 46,
                fontWeight: 850,
              }}
            >
              40%
            </div>
          </div>

          <div
            style={{
              marginTop: 50,
              fontSize: 36,
              lineHeight: 1.4,
              color: C.muted,
            }}
          >
            Если доходы разные, общие расходы
            можно делить пропорционально.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Scene5 = () => {
  const frame = useCurrentFrame();

  const a = spring({
    frame,
    fps: 30,
    config: {damping: 14},
  });

  const b = spring({
    frame: Math.max(0, frame - 12),
    fps: 30,
    config: {damping: 14},
  });

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Header />

      <div
        style={{
          position: 'absolute',
          top: 270,
          left: 78,
          right: 78,
        }}
      >
        <Title>
          И оставьте каждому
          {'\n'}деньги без отчёта.
        </Title>

        <div
          style={{
            marginTop: 120,
            display: 'flex',
            gap: 28,
          }}
        >
          <Card
            style={{
              flex: 1,
              opacity: a,
              transform: `scale(${0.84+a*0.16})`,
            }}
          >
            <div
              style={{
                fontSize: 27,
                color: C.muted,
              }}
            >
              МОИ
            </div>

            <div
              style={{
                fontSize: 66,
                fontWeight: 850,
                marginTop: 30,
              }}
            >
              8 000 ₽
            </div>

            <div
              style={{
                fontSize: 29,
                color: C.muted,
                marginTop: 30,
              }}
            >
              без согласования
            </div>
          </Card>

          <Card
            style={{
              flex: 1,
              opacity: b,
              transform: `scale(${0.84+b*0.16})`,
            }}
          >
            <div
              style={{
                fontSize: 27,
                color: C.muted,
              }}
            >
              ТВОИ
            </div>

            <div
              style={{
                fontSize: 66,
                fontWeight: 850,
                marginTop: 30,
              }}
            >
              8 000 ₽
            </div>

            <div
              style={{
                fontSize: 29,
                color: C.muted,
                marginTop: 30,
              }}
            >
              без объяснений
            </div>
          </Card>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Scene6 = () => {
  const frame = useCurrentFrame();

  const p = spring({
    frame,
    fps: 30,
    config: {damping: 14},
  });

  const items = [
    'обязательное',
    'общие цели',
    'свободные деньги',
  ];

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
          top: 300,
          left: 78,
          right: 78,
          opacity: p,
          transform: `translateY(${(1-p)*70}px)`,
        }}
      >
        <Title light>
          Договоритесь
          {'\n'}о трёх вещах.
        </Title>

        <div
          style={{
            marginTop: 105,
            display: 'grid',
            gap: 24,
          }}
        >
          {items.map((x, i) => (
            <div
              key={x}
              style={{
                padding: '30px 34px',
                borderRadius: 26,
                background:
                  'rgba(255,255,255,.13)',
                fontSize: 37,
                fontWeight: 750,
              }}
            >
              {i + 1}. {x}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 90,
            display: 'inline-flex',
            padding: '24px 36px',
            borderRadius: 999,
            background: C.white,
            color: C.accent,
            fontSize: 30,
            fontWeight: 850,
          }}
        >
          myfamilyflow.ru
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const CoupleBudgetReel = () => {
  const fps = 30;

  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={120}>
        <Scene1 />
      </Sequence>

      <Sequence from={120} durationInFrames={120}>
        <Scene2 />
      </Sequence>

      <Sequence from={240} durationInFrames={120}>
        <Scene3 />
      </Sequence>

      <Sequence from={360} durationInFrames={120}>
        <Scene4 />
      </Sequence>

      <Sequence from={480} durationInFrames={120}>
        <Scene5 />
      </Sequence>

      <Sequence from={600} durationInFrames={150}>
        <Scene6 />
      </Sequence>
    </AbsoluteFill>
  );
};

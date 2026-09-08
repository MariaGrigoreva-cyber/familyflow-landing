import React from 'react';
import {loadFont} from '@remotion/google-fonts/Manrope';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
} from 'remotion';

const {fontFamily} = loadFont();

const C = {
  bg: '#F5EFE8',
  text: '#241E19',
  muted: '#8C7A70',
  accent: '#B55A34',
  soft: '#FBF7F2',
  white: '#FFFFFF',
  green: '#687B65',
};

const Header = ({light = false}) => (
  <>
    <div
      style={{
        position: 'absolute',
        top: 74,
        left: 78,
        fontSize: 25,
        letterSpacing: 1.6,
        fontWeight: 700,
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
      fontSize: 70,
      lineHeight: 1.10,
      fontWeight: 700,
      letterSpacing: -1.4,
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
          top: 250,
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
                fontWeight: 800,
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
                fontWeight: 800,
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

  const move = interpolate(
    frame,
    [0, 42],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  const common = spring({
    frame: Math.max(0, frame - 28),
    fps: 30,
    config: {damping: 14},
  });

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Header />

      <div
        style={{
          position: 'absolute',
          top: 220,
          left: 70,
          right: 70,
        }}
      >
        <Title>
          Сначала решите,
          {'\n'}что у вас общее.
        </Title>

        <div
          style={{
            position: 'relative',
            height: 720,
            marginTop: 70,
          }}
        >
          <Card
            style={{
              position: 'absolute',
              left: interpolate(move, [0, 1], [0, 250]),
              top: interpolate(move, [0, 1], [0, 210]),
              width: 360,
              textAlign: 'center',
              opacity: 1 - move * 0.65,
            }}
          >
            <div style={{fontSize: 26, color: C.muted}}>
              МОЙ ДОХОД
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 58,
                fontWeight: 800,
              }}
            >
              90 000 ₽
            </div>
          </Card>

          <Card
            style={{
              position: 'absolute',
              right: interpolate(move, [0, 1], [0, 250]),
              top: interpolate(move, [0, 1], [0, 210]),
              width: 360,
              textAlign: 'center',
              opacity: 1 - move * 0.65,
            }}
          >
            <div style={{fontSize: 26, color: C.muted}}>
              ТВОЙ ДОХОД
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 58,
                fontWeight: 800,
              }}
            >
              60 000 ₽
            </div>
          </Card>

          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 205,
              opacity: common,
              transform: `scale(${0.82 + common * 0.18})`,
            }}
          >
            <Card accent>
              <div
                style={{
                  fontSize: 27,
                  opacity: 0.8,
                  letterSpacing: 1.2,
                }}
              >
                ОБЩИЕ РАСХОДЫ
              </div>

              <div
                style={{
                  marginTop: 22,
                  fontSize: 70,
                  lineHeight: 1.08,
                  fontWeight: 800,
                }}
              >
                жильё · еда
                {'\n'}ребёнок · цели
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Scene3 = () => {
  const frame = useCurrentFrame();

  const leftP = spring({
    frame,
    fps: 30,
    config: {damping: 14},
  });

  const rightP = spring({
    frame: Math.max(0, frame - 10),
    fps: 30,
    config: {damping: 14},
  });

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Header />

      <div
        style={{
          position: 'absolute',
          top: 220,
          left: 70,
          right: 70,
        }}
      >
        <Title>
          Общее — отдельно.
          {'\n'}Личное — отдельно.
        </Title>

        <div
          style={{
            marginTop: 75,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 22,
            height: 860,
          }}
        >
          <div
            style={{
              borderRadius: 38,
              background: C.accent,
              color: C.white,
              padding: '48px 38px',
              opacity: leftP,
              transform: `translateY(${(1-leftP)*60}px)`,
            }}
          >
            <div
              style={{
                fontSize: 29,
                letterSpacing: 1.5,
                opacity: 0.8,
              }}
            >
              ОБЩЕЕ
            </div>

            <div
              style={{
                marginTop: 85,
                fontSize: 60,
                lineHeight: 1.35,
                fontWeight: 800,
              }}
            >
              жильё
              {'\n'}еда
              {'\n'}ребёнок
              {'\n'}цели
            </div>
          </div>

          <div
            style={{
              borderRadius: 38,
              background: C.green,
              color: C.white,
              padding: '48px 38px',
              opacity: rightP,
              transform: `translateY(${(1-rightP)*60}px)`,
            }}
          >
            <div
              style={{
                fontSize: 29,
                letterSpacing: 1.5,
                opacity: 0.8,
              }}
            >
              ЛИЧНОЕ
            </div>

            <div
              style={{
                marginTop: 85,
                fontSize: 60,
                lineHeight: 1.35,
                fontWeight: 800,
              }}
            >
              кофе
              {'\n'}хобби
              {'\n'}одежда
              {'\n'}свои покупки
            </div>
          </div>
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
          top: 235,
          left: 70,
          right: 70,
        }}
      >
        <Title>
          50/50 — не всегда
          {'\n'}самый честный вариант.
        </Title>

        <div
          style={{
            marginTop: 130,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: 230,
              borderRadius: 42,
              overflow: 'hidden',
              background: C.soft,
              boxShadow:
                '0 18px 48px rgba(45,30,20,.10)',
            }}
          >
            <div
              style={{
                width: `${widthA}%`,
                background: C.accent,
                color: C.white,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 70,
                fontWeight: 800,
              }}
            >
              60%
            </div>

            <div
              style={{
                width: `${widthB}%`,
                background: C.green,
                color: C.white,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 70,
                fontWeight: 800,
              }}
            >
              40%
            </div>
          </div>

          <div
            style={{
              marginTop: 55,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 35,
              fontWeight: 700,
              color: C.text,
            }}
          >
            <div>90 000 ₽</div>
            <div>60 000 ₽</div>
          </div>

          <div
            style={{
              marginTop: 70,
              fontSize: 40,
              lineHeight: 1.35,
              color: C.muted,
              maxWidth: 880,
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
    frame: Math.max(0, frame - 10),
    fps: 30,
    config: {damping: 14},
  });

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Header />

      <div
        style={{
          position: 'absolute',
          top: 235,
          left: 70,
          right: 70,
        }}
      >
        <Title>
          И каждому —
          {'\n'}деньги без отчёта.
        </Title>

        <div
          style={{
            marginTop: 110,
            display: 'flex',
            gap: 24,
          }}
        >
          <Card
            style={{
              flex: 1,
              minHeight: 480,
              opacity: a,
              transform: `scale(${0.86 + a*0.14})`,
            }}
          >
            <div
              style={{
                fontSize: 28,
                color: C.muted,
              }}
            >
              МОИ
            </div>

            <div
              style={{
                marginTop: 55,
                fontSize: 82,
                fontWeight: 800,
              }}
            >
              8 000 ₽
            </div>

            <div
              style={{
                marginTop: 60,
                fontSize: 34,
                lineHeight: 1.35,
                color: C.muted,
              }}
            >
              кофе
              {'\n'}хобби
              {'\n'}без согласования
            </div>
          </Card>

          <Card
            style={{
              flex: 1,
              minHeight: 480,
              opacity: b,
              transform: `scale(${0.86 + b*0.14})`,
            }}
          >
            <div
              style={{
                fontSize: 28,
                color: C.muted,
              }}
            >
              ТВОИ
            </div>

            <div
              style={{
                marginTop: 55,
                fontSize: 82,
                fontWeight: 800,
              }}
            >
              8 000 ₽
            </div>

            <div
              style={{
                marginTop: 60,
                fontSize: 34,
                lineHeight: 1.35,
                color: C.muted,
              }}
            >
              покупки
              {'\n'}интересы
              {'\n'}без объяснений
            </div>
          </Card>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Scene6 = () => {
  const frame = useCurrentFrame();

  const titleP = spring({
    frame,
    fps: 30,
    config: {damping: 14},
  });

  const siteP = spring({
    frame: Math.max(0, frame - 25),
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
          top: 255,
          left: 70,
          right: 70,
          opacity: titleP,
          transform: `translateY(${(1-titleP)*60}px)`,
        }}
      >
        <Title light>
          Договоритесь
          {'\n'}о трёх вещах.
        </Title>

        <div
          style={{
            marginTop: 85,
            display: 'grid',
            gap: 22,
          }}
        >
          {items.map((x, i) => (
            <div
              key={x}
              style={{
                padding: '34px 38px',
                borderRadius: 30,
                background:
                  'rgba(255,255,255,.13)',
                fontSize: 42,
                fontWeight: 700,
              }}
            >
              {i + 1}. {x}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 85,
            width: '100%',
            padding: '34px 40px',
            borderRadius: 999,
            background: C.white,
            color: C.accent,
            fontSize: 40,
            textAlign: 'center',
            fontWeight: 800,
            opacity: siteP,
            transform: `scale(${0.9 + siteP*0.1})`,
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
    <AbsoluteFill
      style={{
        fontFamily,
      }}
    >
      <Sequence from={0} durationInFrames={105}>
        <Scene1 />
      </Sequence>

      <Sequence from={105} durationInFrames={105}>
        <Scene2 />
      </Sequence>

      <Sequence from={210} durationInFrames={105}>
        <Scene3 />
      </Sequence>

      <Sequence from={315} durationInFrames={120}>
        <Scene4 />
      </Sequence>

      <Sequence from={435} durationInFrames={105}>
        <Scene5 />
      </Sequence>

      <Sequence from={540} durationInFrames={120}>
        <Scene6 />
      </Sequence>
    </AbsoluteFill>
  );
};

import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
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
      bottom: 145,
      padding: '28px 30px',
      borderRadius: 24,
      background: light
        ? 'rgba(36,30,25,.72)'
        : 'rgba(255,253,252,.95)',
      fontSize: 37,
      lineHeight: 1.22,
      fontWeight: 600,
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
          {data.hook ||
            scene.overlay ||
            'Главное — увидеть свободные деньги'}
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

const Phone = ({frame, screen}) => {
  const float = Math.sin(frame / 15) * 8;

  const zoom = interpolate(
    frame,
    [0, 150],
    [1, 1.025],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  return (
    <div
      style={{
        width: 430,
        height: 790,
        borderRadius: 58,
        padding: 16,
        background: '#25201D',
        boxShadow: '0 35px 90px rgba(40,28,20,.24)',
        transform: `translateY(${float}px)`,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 43,
          overflow: 'hidden',
          background: '#000',
          position: 'relative',
        }}
      >
        <Img
          src={staticFile(screen)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top center',
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 13,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 105,
            height: 29,
            borderRadius: 999,
            background: '#111',
            zIndex: 2,
          }}
        />
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
          <Phone
            frame={frame}
            screen="motion-assets/app/dashboard.png"
          />
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

  const phoneP = spring({
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
          left: 78,
          right: 78,
          top: 220,
        }}
      >
        <BigTitle>
          {scene.overlay ||
            'Сначала обязательное'}
        </BigTitle>

        <div
          style={{
            marginTop: 65,
            display: 'flex',
            justifyContent: 'center',
            opacity: phoneP,
            transform: `translateY(${(1 - phoneP) * 90}px)`,
          }}
        >
          <Phone
            frame={frame}
            screen="motion-assets/app/payments.png"
          />
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

  const phoneP = spring({
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
          left: 78,
          right: 78,
          top: 220,
        }}
      >
        <BigTitle>
          {scene.overlay ||
            'Потом — обычная жизнь'}
        </BigTitle>

        <div
          style={{
            marginTop: 65,
            display: 'flex',
            justifyContent: 'center',
            opacity: phoneP,
            transform: `translateY(${(1 - phoneP) * 90}px)`,
          }}
        >
          <Phone
            frame={frame}
            screen="motion-assets/app/plan.png"
          />
        </div>
      </div>

      <Subtitle>
        {scene.voice ||
          'Продукты, дорогу и мелочи удобнее планировать заранее.'}
      </Subtitle>
    </AbsoluteFill>
  );
};

const Scene5 = ({data}) => {
  const frame = useCurrentFrame();
  const scene = getScene(data, 4);

  const phoneP = spring({
    frame,
    fps: 30,
    config: {damping: 15},
  });

  const badgeP = spring({
    frame: Math.max(0, frame - 18),
    fps: 30,
    config: {damping: 14},
  });

  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Header />

      <div
        style={{
          position: 'absolute',
          left: 78,
          right: 78,
          top: 220,
        }}
      >
        <BigTitle>
          {scene.overlay ||
            'Смотрите на свободный остаток'}
        </BigTitle>

        <div
          style={{
            marginTop: 65,
            display: 'flex',
            justifyContent: 'center',
            opacity: phoneP,
            transform: `translateY(${(1 - phoneP) * 90}px)`,
            position: 'relative',
          }}
        >
          <Phone
            frame={frame}
            screen="motion-assets/app/free-money.png"
          />

          <div
            style={{
              position: 'absolute',
              right: 10,
              top: 535,
              padding: '22px 27px',
              borderRadius: 24,
              background: C.accent,
              color: C.white,
              fontSize: 28,
              fontWeight: 800,
              boxShadow: '0 15px 40px rgba(50,30,20,.18)',
              opacity: badgeP,
              transform: `scale(${0.82 + badgeP * 0.18})`,
            }}
          >
            Вот что реально свободно
          </div>
        </div>
      </div>

      <Subtitle>
        {scene.voice ||
          'И только после этого видно, сколько денег действительно можно тратить.'}
      </Subtitle>
    </AbsoluteFill>
  );
};

const Scene6 = ({data}) => {
  const frame = useCurrentFrame();
  const scene = getScene(data, 5);

  const titleP = spring({
    frame,
    fps: 30,
    config: {damping: 15},
  });

  const textP = spring({
    frame: Math.max(0, frame - 12),
    fps: 30,
    config: {damping: 16},
  });

  const domainP = spring({
    frame: Math.max(0, frame - 26),
    fps: 30,
    config: {damping: 14},
  });

  const lineWidth = interpolate(
    frame,
    [20, 55],
    [0, 220],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

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
          top: 330,
        }}
      >
        <div
          style={{
            fontSize: 86,
            lineHeight: 1.04,
            fontWeight: 850,
            letterSpacing: -3,
            opacity: titleP,
            transform: `translateY(${(1 - titleP) * 80}px)`,
          }}
        >
          {scene.overlay ||
            'Вот ваш реальный остаток'}
        </div>

        <div
          style={{
            width: lineWidth,
            height: 8,
            marginTop: 68,
            borderRadius: 999,
            background: '#F3B097',
          }}
        />

        <div
          style={{
            marginTop: 64,
            fontSize: 39,
            lineHeight: 1.34,
            color: '#F8DFD6',
            maxWidth: 830,
            opacity: textP,
            transform: `translateY(${(1 - textP) * 45}px)`,
          }}
        >
          Спокойнее, когда у денег есть задача
          до покупки.
        </div>

        <div
          style={{
            marginTop: 105,
            display: 'inline-flex',
            padding: '25px 36px',
            borderRadius: 999,
            background: C.white,
            color: C.accent,
            fontSize: 31,
            fontWeight: 800,
            opacity: domainP,
            transform: `scale(${0.86 + domainP * 0.14})`,
            transformOrigin: 'left center',
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

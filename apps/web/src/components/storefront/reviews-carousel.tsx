'use client';

import { useState } from 'react';

type Review = {
  id: string;
  name: string;
  text: string;
};

const REVIEWS: Review[] = [
  {
    id: '1',
    name: 'Анна',
    text: 'Заказывала букет маме. Цветы свежие, красиво собраны, доставили вовремя. Обязательно вернусь ещё.',
  },
  {
    id: '2',
    name: 'Сергей',
    text: 'Букет выглядел даже лучше, чем на фото. Упаковка аккуратная, курьер вежливый. Рекомендую!',
  },
  {
    id: '3',
    name: 'Ольга',
    text: 'Очень нежная композиция, стояла долго. Сервис на высоте — помогли выбрать по бюджету.',
  },
  {
    id: '4',
    name: 'Дмитрий',
    text: 'Нужен был сюрприз в тот же день — получилось. Спасибо за оперативность и вкус флориста.',
  },
  {
    id: '5',
    name: 'Мария',
    text: 'Уже третий раз заказываю. Всегда свежие цветы и понятная связь по заказу.',
  },
];

export function ReviewsCarousel() {
  const [index, setIndex] = useState(0);
  const visible = 3;
  const max = Math.max(0, REVIEWS.length - visible);

  function prev() {
    setIndex((i) => Math.max(0, i - 1));
  }

  function next() {
    setIndex((i) => Math.min(max, i + 1));
  }

  return (
    <section className="sf-band-surface py-12 md:py-16">
      <div className="sf-container-wide">
        <div className="sf-section-title">
          <p className="sf-label">Отзывы</p>
          <h2 className="sf-h2">Что говорят клиенты</h2>
        </div>

        <div className="relative">
          <ul className="grid gap-4 md:grid-cols-3">
            {REVIEWS.slice(index, index + visible).map((review) => (
              <li key={review.id} className="sf-review-card">
                <p className="sf-body text-foreground">{review.text}</p>
                <p className="mt-4 text-sm font-semibold text-ink">{review.name}</p>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              className="sf-cta-ghost min-h-9 px-3"
              onClick={prev}
              disabled={index === 0}
              aria-label="Предыдущие отзывы"
            >
              ←
            </button>
            <button
              type="button"
              className="sf-cta-ghost min-h-9 px-3"
              onClick={next}
              disabled={index >= max}
              aria-label="Следующие отзывы"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

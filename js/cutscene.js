export class CutsceneManager {
  constructor(uiDispatcher) {
    this.ui = uiDispatcher;
    this.layer = document.getElementById("cutscene-layer");
    this.bg = document.getElementById("cutscene-bg");
    this.char = document.getElementById("cutscene-char");
    this.btnSkip = document.getElementById("btn-skip-cutscene");
    
    this.isSkipped = false;
    this.currentSlideTimer = null;
    this.fadeTimer = null;
    this.resolveSequence = null;
    this.resolveSlide = null; // <-- Добавили, чтобы разблокировать зависший цикл
  }

  // Запуск всей сцены
  async playSequence(slides) {
    this.isSkipped = false;
    this.layer.classList.remove("cutscene-hidden");
    
    // Обработчик кнопки ПРОПУСТИТЬ
    const skipHandler = () => {
      if (this.isSkipped) return;
      this.isSkipped = true;
      if (this.currentSlideTimer) clearTimeout(this.currentSlideTimer);
      if (this.fadeTimer) clearTimeout(this.fadeTimer);
      
      // РАЗБЛОКИРУЕМ ЦИКЛ! Если слайд висел в ожидании, отпускаем его
      if (this.resolveSlide) this.resolveSlide();
      
      this.endCutscene();
    };
    this.btnSkip.onclick = skipHandler;

    // Ждем секунду темноты перед стартом
    await new Promise(res => setTimeout(res, 1000));

    // Проигрываем слайды по очереди
    for (let i = 0; i < slides.length; i++) {
      if (this.isSkipped) break; // Если скипнули - прерываем цикл
      await this.showSlide(slides[i]);
    }

    // Если всё просмотрели до конца и не скипали
    if (!this.isSkipped) {
      this.endCutscene();
    }
    
    // Ждем финального затухания, чтобы отдать контроль обратно в ui.js
    return new Promise(res => {
      this.resolveSequence = res;
    });
  }

  showSlide(slideData) {
    return new Promise((resolve) => {
      this.resolveSlide = resolve; // Сохраняем управление этим слайдом
      
      // ФИКС КАРТИНОК: Если картинки нет, жестко убираем её из DOM (display: none)
      if (slideData.bg) {
        this.bg.src = slideData.bg;
        this.bg.style.display = "block";
      } else {
        this.bg.removeAttribute("src");
        this.bg.style.display = "none";
      }

      if (slideData.char) {
        this.char.src = slideData.char;
        this.char.style.display = "block";
      } else {
        this.char.removeAttribute("src");
        this.char.style.display = "none";
      }

      requestAnimationFrame(() => {
        if (slideData.bg) this.bg.classList.add("active-slide");
        else this.bg.classList.remove("active-slide");

        if (slideData.char) this.char.classList.add("active-slide");
        else this.char.classList.remove("active-slide");
      });

      const slideDuration = slideData.duration || 4500;

      // Ждем, пока слайд висит на экране
      this.currentSlideTimer = setTimeout(() => {
        if (this.isSkipped) return resolve(); // Защита от перекрытия таймеров
        
        // Плавно гасим текущий слайд
        this.bg.classList.remove("active-slide");
        this.char.classList.remove("active-slide");
        
        // Ждем 800мс темноты перед следующим слайдом
        this.fadeTimer = setTimeout(() => resolve(), 800);
      }, slideDuration);
    });
  }

  endCutscene() {
    // Гасим всё
    this.bg.classList.remove("active-slide");
    this.char.classList.remove("active-slide");
    this.btnSkip.onclick = null; // Отключаем кнопку
    
    // Даем секунду на угасание картинок, потом прячем весь слой
    setTimeout(() => {
      this.layer.classList.add("cutscene-hidden");
      
      // Сигнализируем в ui.js, что сцена закончилась
      if (this.resolveSequence) {
        this.resolveSequence();
        this.resolveSequence = null;
      }
    }, 1000);
  }
}
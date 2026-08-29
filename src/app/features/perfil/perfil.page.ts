import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  effect,
  EffectCleanupRegisterFn,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { AuthService } from '../../core/auth/auth.service';
import { generarIniciales } from '../../core/auth/user.model';
import { ToastService } from '../../core/toast/toast.service';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PerfilService } from './perfil.service';

import { httpResource } from '@angular/common/http';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { CuotaMemoria, RecursoMemoria } from '../memoria-agente/memoria-agente.model';
import { MemoriaAgenteService } from '../memoria-agente/memoria-agente.service';

import { ActivatedRoute } from '@angular/router';
import { ImageViewerComponent } from '../../shared/components/image-viewer/image-viewer.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-perfil',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    ErrorCargaComponent,
    AvatarComponent,
    ButtonComponent,
    IconComponent,
    BadgeComponent,
    InputComponent,
    ImageViewerComponent,
  ],
  templateUrl: './perfil.page.html',
  styleUrl: './perfil.page.css',
})
export class PerfilPage {
  private readonly perfilService = inject(PerfilService);
  private readonly authService = inject(AuthService);
  private readonly memoriaService = inject(MemoriaAgenteService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected readonly tabActiva = signal<'perfil' | 'memoria'>('perfil');
  protected readonly user = this.authService.user;
  protected readonly iniciales = computed(() => {
    const u = this.user();
    return u ? u.iniciales : '';
  });

  protected readonly previewFoto = signal<string | null>(null);
  protected readonly guardando = signal(false);

  /* ── Memoria Personal (Biblioteca Privada 30 MB) ──────────────── */
  protected readonly busquedaMemoria = signal('');
  private readonly busquedaMemoriaDebounced = signal('');
  protected readonly filtroTipoMemoria = signal('');
  protected readonly tituloNuevoMemoria = signal('');
  protected readonly contenidoNuevoMemoria = signal('');
  protected readonly atajoNuevoMemoria = signal('');
  protected readonly subiendoMemoria = signal(false);
  protected readonly lightboxImagenUrl = signal<string | null>(null);

  protected abrirLightbox(url: string): void {
    if (url) this.lightboxImagenUrl.set(url);
  }

  protected cerrarLightbox(): void {
    this.lightboxImagenUrl.set(null);
  }

  protected readonly cuotaMemoria = httpResource<CuotaMemoria>(
    () => this.memoriaService.cuotaRequest(),
  );

  private readonly recursosMemoriaRecurso = httpResource<RespuestaPaginada<RecursoMemoria>>(
    () =>
      this.memoriaService.listarRequest({
        busqueda: this.busquedaMemoriaDebounced(),
        tipo: this.filtroTipoMemoria(),
      }),
    { defaultValue: paginaVacia<RecursoMemoria>() },
  );

  /** Proyección: la vista solo necesita la lista, no la envoltura de paginación. */
  protected readonly recursosMemoria = computed(() => this.recursosMemoriaRecurso.value().datos);

  /* El recurso es privado, así que la plantilla necesita estos dos para poder
     distinguir "no tienes recursos" de "no se pudieron traer". */
  protected readonly recursosMemoriaError = computed(() => !!this.recursosMemoriaRecurso.error());

  protected recargarRecursosMemoria(): void {
    this.recursosMemoriaRecurso.reload();
  }

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  protected readonly perfilForm = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl(''),
  });

  constructor() {
    effect((onCleanup: EffectCleanupRegisterFn) => {
      const texto = this.busquedaMemoria().trim();
      const timer = setTimeout(() => {
        this.busquedaMemoriaDebounced.set(texto);
      }, 200);
      onCleanup(() => clearTimeout(timer));
    });

    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (tabParam === 'memoria') {
      this.tabActiva.set('memoria');
      this.cuotaMemoria.reload();
      this.recursosMemoriaRecurso.reload();
    }

    const u = this.user();
    if (u) {
      this.perfilForm.patchValue({
        nombre: u.nombre,
        email: u.email,
      });
      if (u.foto) {
        this.previewFoto.set(u.foto);
      }
    }
  }

  protected cambiarTab(tab: 'perfil' | 'memoria'): void {
    this.tabActiva.set(tab);
    if (tab === 'memoria') {
      this.cuotaMemoria.reload();
      this.recursosMemoriaRecurso.reload();
    }
  }

  protected triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.toast.error('Por favor, selecciona una imagen válida.', 'Formato no soportado');
      return;
    }

    try {
      /* Se comprime SIEMPRE antes de guardar: la foto viaja en el perfil y se
         renderiza en avatares; una imagen de 2 MB sería un lastre en todo el
         sistema. Se redimensiona a máx. 256px y se re-codifica a JPEG → ~20-60 KB. */
      const comprimida = await this.comprimirImagen(file);
      this.previewFoto.set(comprimida);
    } catch {
      this.toast.error('No se pudo procesar la imagen. Probá con otra.', 'Formato no soportado');
    }
  }

  /** Redimensiona y comprime una imagen a un data URL JPEG pequeño (client-side, con canvas). */
  private comprimirImagen(file: File, maxLado = 256, calidad = 0.82): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
        img.onload = () => {
          const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
          const ancho = Math.max(1, Math.round(img.width * escala));
          const alto = Math.max(1, Math.round(img.height * escala));
          const canvas = document.createElement('canvas');
          canvas.width = ancho;
          canvas.height = alto;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Sin contexto de canvas'));
            return;
          }
          ctx.drawImage(img, 0, 0, ancho, alto);
          resolve(canvas.toDataURL('image/jpeg', calidad));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  protected removeFoto(): void {
    this.previewFoto.set(null);
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  protected onSubmit(): void {
    if (this.perfilForm.invalid) return;

    this.guardando.set(true);
    const formVal = this.perfilForm.getRawValue();

    this.perfilService
      .actualizar({
        nombre: formVal.nombre,
        email: formVal.email,
        foto: this.previewFoto(),
        /* La contraseña solo viaja si el usuario escribió una nueva. */
        ...(formVal.password ? { password: formVal.password } : {}),
      })
      .then(res => {
        this.guardando.set(false);
        this.toast.success('Tu perfil ha sido actualizado correctamente.', 'Perfil Actualizado');

        // Actualizar sesión en local
        const currentUser = this.user();
        if (currentUser) {
          this.authService.actualizarUsuarioLocal({
            ...currentUser,
            nombre: res.nombre,
            email: res.email,
            foto: res.foto,
            iniciales: generarIniciales(res.nombre),
          });
        }

        // Limpiar campo password
        this.perfilForm.patchValue({ password: '' });
      })
      .catch((err: unknown) => {
        this.guardando.set(false);
        this.toast.error(
          mensajeDeError(err, 'No se pudo guardar la información.'),
          'Error al Guardar',
        );
      });
  }

  /* ── Métodos de Memoria Personal del Agente ───────────────────── */
  protected async guardarRecursoMemoria(): Promise<void> {
    const titulo = this.tituloNuevoMemoria().trim();
    const contenido = this.contenidoNuevoMemoria().trim();
    const atajo = this.atajoNuevoMemoria().trim();

    if (!titulo) {
      this.toast.error('Ingresa un título para la nota o recurso', 'Campo requerido');
      return;
    }

    this.subiendoMemoria.set(true);
    try {
      await this.memoriaService.crear({
        titulo,
        contenido: contenido || undefined,
        atajo: atajo || undefined,
      });

      this.toast.success('Nota guardada en tu Memoria Personal', 'Éxito');
      this.tituloNuevoMemoria.set('');
      this.contenidoNuevoMemoria.set('');
      this.atajoNuevoMemoria.set('');
      this.recursosMemoriaRecurso.reload();
      this.cuotaMemoria.reload();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar'), 'Error');
    } finally {
      this.subiendoMemoria.set(false);
    }
  }

  protected async subirArchivoMemoria(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.subiendoMemoria.set(true);
    try {
      await this.memoriaService.subirBinario(file, { titulo: file.name });
      this.toast.success(`Archivo "${file.name}" subido a tu Memoria`, 'Éxito');
      input.value = '';
      this.recursosMemoriaRecurso.reload();
      this.cuotaMemoria.reload();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'Error al subir archivo'), 'Error');
    } finally {
      this.subiendoMemoria.set(false);
    }
  }

  protected async eliminarRecursoMemoria(id: string): Promise<void> {
    try {
      await this.memoriaService.eliminar(id);
      this.toast.success('Recurso eliminado. Espacio liberado.', 'Éxito');
      this.recursosMemoriaRecurso.reload();
      this.cuotaMemoria.reload();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo eliminar'), 'Error');
    }
  }

  protected copiarTexto(texto: string): void {
    void navigator.clipboard.writeText(texto);
    this.toast.success('Copiado al portapapeles', 'Memoria Personal');
  }
}

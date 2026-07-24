import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { mensajeDeError } from '../../core/api/http-error';
import { AuthService } from '../../core/auth/auth.service';
import { generarIniciales, UsuarioApi } from '../../core/auth/user.model';
import { ToastService } from '../../core/toast/toast.service';
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

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-perfil',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    AvatarComponent,
    ButtonComponent,
    IconComponent,
    BadgeComponent,
    InputComponent,
  ],
  templateUrl: './perfil.page.html',
  styleUrl: './perfil.page.css',
})
export class PerfilPage {
  private readonly perfilService = inject(PerfilService);
  private readonly authService = inject(AuthService);
  private readonly memoriaService = inject(MemoriaAgenteService);
  private readonly toast = inject(ToastService);

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
  protected readonly filtroTipoMemoria = signal('');
  protected readonly tituloNuevoMemoria = signal('');
  protected readonly contenidoNuevoMemoria = signal('');
  protected readonly atajoNuevoMemoria = signal('');
  protected readonly subiendoMemoria = signal(false);

  protected readonly cuotaMemoria = httpResource<CuotaMemoria>(
    () => this.memoriaService.cuotaRequest(),
  );

  protected readonly recursosMemoria = httpResource<RecursoMemoria[]>(
    () =>
      this.memoriaService.listarRequest({
        busqueda: this.busquedaMemoria(),
        tipo: this.filtroTipoMemoria(),
      }),
    { defaultValue: [] },
  );

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  protected readonly perfilForm = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl(''),
  });

  constructor() {
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

  protected triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        this.toast.error('Por favor, selecciona una imagen válida.', 'Formato no soportado');
        return;
      }

      // Validar tamaño de archivo (máximo 2MB para Base64)
      if (file.size > 2 * 1024 * 1024) {
        this.toast.error('La imagen no debe superar los 2MB.', 'Imagen muy pesada');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result as string;
        this.previewFoto.set(base64String);
      };
      reader.readAsDataURL(file);
    }
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
      this.recursosMemoria.reload();
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
      this.recursosMemoria.reload();
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
      this.recursosMemoria.reload();
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

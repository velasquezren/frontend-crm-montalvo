import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
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

@Component({
  selector: 'app-perfil',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    AvatarComponent,
    ButtonComponent,
    IconComponent,
  ],
  templateUrl: './perfil.page.html',
  styleUrl: './perfil.page.css',
})
export class PerfilPage {
  private readonly perfilService = inject(PerfilService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly user = this.authService.user;
  protected readonly iniciales = computed(() => {
    const u = this.user();
    return u ? u.iniciales : '';
  });

  protected readonly previewFoto = signal<string | null>(null);
  protected readonly guardando = signal(false);

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
}
